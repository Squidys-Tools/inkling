import { Effect } from "effect";
import type { LibraryCard } from "@inkling/contracts";
import { IMAGE_MODEL, TEXT_MODEL } from "@inkling/contracts/jobs";
import type { StorageContext } from "./context.ts";
import {
  cardItem,
  itemColumns,
  itemFromRow,
  type ItemRow,
  qualifiedItemColumns,
  selectCards,
} from "./rows.ts";
import { clampLimit } from "./shared.ts";
import { invalidInput } from "./errors.ts";

const semanticMatchFloor = 0.55;

type EmbeddingRow = ItemRow & { embedding_dimension: number; embedding_vector: Uint8Array };

export type QueryVector = ArrayLike<number> | null | undefined;

export function escapeFtsQuery(query: string) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', "")}"`)
    .filter((token) => token !== '""')
    .join(" ");
}

export function decodeFloatVector(blob: Uint8Array, dimension: number) {
  if (blob.byteLength !== dimension * 4) return null;
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return Array.from({ length: dimension }, (_, index) => bytes.readFloatLE(index * 4));
}

// Callers skip vectors whose length differs from the query's.
export function dotProduct(left: ArrayLike<number>, right: ArrayLike<number>) {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

export function sqlLikePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

export function makeSearch(ctx: StorageContext) {
  const { sql } = ctx;

  const likeClause = (pattern: string, prefix = "") => {
    const column = (name: string) =>
      sql`${sql.literal(`${prefix}${name}`)} COLLATE NOCASE LIKE ${pattern} ESCAPE char(92)`;
    return sql`(${sql.or(["title", "description", "body", "source_label", "ocr_text", "metadata"].map(column))})`;
  };

  const storeEmbedding = Effect.fnUntraced(function* (
    itemId: string,
    kind: string,
    model: string,
    bytes: Uint8Array,
    dimension: number,
  ) {
    if (kind !== "text" && kind !== "image") {
      return yield* invalidInput("embedding kind must be text or image");
    }
    const vector = Buffer.from(bytes);
    if (!Number.isInteger(dimension) || dimension < 1 || vector.length !== dimension * 4) {
      return yield* invalidInput("embedding vector dimension does not match its bytes");
    }
    yield* sql`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
      VALUES (${itemId}, ${kind}, ${model}, ${dimension}, ${vector}, ${Date.now()})
      ON CONFLICT(item_id, kind) DO UPDATE SET model = excluded.model,
      dimension = excluded.dimension, vector = excluded.vector, created_at = excluded.created_at`;
  });

  const searchItems = Effect.fnUntraced(function* (
    query: string,
    limit = 100,
    queryVector: QueryVector = null,
  ) {
    const search = query.trim();
    const cap = clampLimit(limit, 100, 200);
    if (!search) return yield* selectCards(ctx, sql`archived = 0`, cap);
    let rows: ReadonlyArray<ItemRow> = [];
    if (ctx.fts5Enabled) {
      const match = escapeFtsQuery(search);
      if (match) {
        rows = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)}
          FROM items_fts f JOIN items i ON i.id = f.item_id
          WHERE i.archived = 0 AND items_fts MATCH ${match}
          ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ${cap}`;
      }
    } else {
      rows = yield* sql<ItemRow>`SELECT ${sql.literal(itemColumns)} FROM items
        WHERE archived = 0 AND ${likeClause(sqlLikePattern(search))}
        ORDER BY updated_at DESC, created_at DESC LIMIT ${cap}`;
    }
    const lexicalItems = rows.map(itemFromRow);
    if (!queryVector?.length) return lexicalItems.map(cardItem);

    const ranked = new Map(lexicalItems.map((item) => [item.id, { item, score: 2 }]));
    const candidates = yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},
      e.dimension AS embedding_dimension, e.vector AS embedding_vector
      FROM item_embeddings e JOIN items i ON i.id = e.item_id
      WHERE i.archived = 0 AND ((e.kind = 'text' AND e.model = ${TEXT_MODEL})
        OR (e.kind = 'image' AND e.model = ${IMAGE_MODEL}))`;
    for (const row of candidates) {
      const vector = decodeFloatVector(row.embedding_vector, row.embedding_dimension);
      if (!vector || vector.length !== queryVector.length) continue;
      const item = itemFromRow(row);
      const similarity = dotProduct(queryVector, vector);
      const current = ranked.get(item.id);
      if (similarity < semanticMatchFloor && !current) continue;
      const score = current ? 2 + Math.max(similarity, 0) : similarity;
      if (current) current.score = Math.max(current.score, score);
      else ranked.set(item.id, { item, score });
    }

    return [...ranked.values()]
      .sort((left, right) => right.score - left.score || right.item.updatedAt - left.item.updatedAt)
      .slice(0, cap)
      .map(({ item }) => cardItem(item));
  });

  const searchSimilar = Effect.fnUntraced(function* (
    itemId: string,
    kind: "image" | "text",
    limit = 12,
  ) {
    const model = kind === "image" ? IMAGE_MODEL : TEXT_MODEL;
    const [source] = yield* sql<{ dimension: number; vector: Uint8Array }>`SELECT dimension, vector
      FROM item_embeddings WHERE item_id = ${itemId} AND kind = ${kind} AND model = ${model}`;
    if (!source) return [] as LibraryCard[];
    const sourceVector = decodeFloatVector(source.vector, source.dimension);
    if (!sourceVector)
      return yield* invalidInput(`stored ${kind} embedding dimension does not match its vector`);
    const kinds =
      kind === "image" ? sql`i.kind = 'image'` : sql`i.kind IN ('article', 'url', 'note', 'quote')`;
    const candidates = yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},
      e.dimension AS embedding_dimension, e.vector AS embedding_vector
      FROM item_embeddings e JOIN items i ON i.id = e.item_id
      WHERE i.archived = 0 AND i.id != ${itemId} AND ${kinds}
      AND e.kind = ${kind} AND e.model = ${model}`;
    return candidates
      .flatMap((row) => {
        const vector = decodeFloatVector(row.embedding_vector, row.embedding_dimension);
        return vector && vector.length === sourceVector.length
          ? [{ item: itemFromRow(row), score: dotProduct(sourceVector, vector) }]
          : [];
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, clampLimit(limit, 12, 50))
      .map(({ item }) => cardItem(item));
  });

  return { storeEmbedding, searchItems, searchSimilar, likeClause };
}
