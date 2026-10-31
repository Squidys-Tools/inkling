import { Effect } from "effect";
import type { Fragment } from "effect/sql/Statement";
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

export type QueryVector = ArrayLike<number> | null | undefined;

export function escapeFtsQuery(query: string) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', "")}"`)
    .filter((token) => token !== '""')
    .join(" ");
}

// Current-model vectors of one dimension, decoded once into one contiguous
// matrix, text rows first and then image rows. Stored blobs are little-endian
// float32, the native byte order of every platform Inkling ships on.
type VectorGroup = { ids: string[]; matrix: Float32Array; dimension: number; textRows: number };
type VectorRow = { item_id: string; kind: string; dimension: number; vector: Uint8Array };

function decodeFloatVector(blob: Uint8Array, dimension: number) {
  if (blob.byteLength !== dimension * 4) return null;
  return new Float32Array(Uint8Array.from(blob).buffer);
}

// Dot products of `query` with rows [from, to), summed in index order in double
// precision, exactly like a plain loop over the decoded numbers.
function dotScores(group: VectorGroup, query: ArrayLike<number>, from: number, to: number) {
  const { matrix, dimension } = group;
  const q = Float64Array.from(query);
  const scores = new Float64Array(group.ids.length);
  for (let row = from, base = from * dimension; row < to; row += 1, base += dimension) {
    let score = 0;
    for (let index = 0; index < dimension; index += 1) score += q[index] * matrix[base + index];
    scores[row] = score;
  }
  return scores;
}

// The k best accepted rows of [from, to), best first; equal scores keep row order.
// Every accepted row tied with the k-th score is kept too, so callers that break
// ties another way (newest first) see the whole tie, not whichever rows came first.
function topRows(
  scores: Float64Array,
  k: number,
  from: number,
  to: number,
  accept: (row: number) => boolean,
) {
  const rows: number[] = [];
  for (let row = from; row < to; row += 1) {
    const score = scores[row];
    if (rows.length === k && score <= scores[rows[k - 1]]) continue;
    if (!accept(row)) continue;
    let at = rows.length === k ? k - 1 : rows.length;
    while (at > 0 && scores[rows[at - 1]] < score) {
      rows[at] = rows[at - 1];
      at -= 1;
    }
    rows[at] = row;
  }
  if (rows.length === k) {
    const last = scores[rows[k - 1]];
    const kept = new Set(rows);
    for (let row = from; row < to; row += 1) {
      if (scores[row] === last && !kept.has(row) && accept(row)) rows.push(row);
    }
  }
  return rows;
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

  // Every embedding write goes through storeEmbedding, which bumps the generation;
  // item deletes cascade and change the row count, so (count, last rowid) catches
  // them. Archived items stay in the cache and are filtered when rows are read.
  let generation = 0;
  let vectorCache: {
    generation: number;
    signature: string;
    groups: Map<number, VectorGroup>;
  } | null = null;

  const vectorGroups = Effect.fnUntraced(function* () {
    const startedAt = generation;
    const [state] = yield* sql<{ total: number; last: number }>`SELECT COUNT(*) AS total,
      COALESCE(MAX(rowid), 0) AS last FROM item_embeddings`;
    const signature = `${state?.total ?? 0}:${state?.last ?? 0}`;
    if (vectorCache?.generation === startedAt && vectorCache.signature === signature) {
      return vectorCache.groups;
    }
    const rows = yield* sql<VectorRow>`SELECT item_id, kind, dimension, vector FROM item_embeddings
      WHERE (kind = 'text' AND model = ${TEXT_MODEL}) OR (kind = 'image' AND model = ${IMAGE_MODEL})`;
    const byDimension = new Map<number, { text: VectorRow[]; image: VectorRow[] }>();
    for (const row of rows) {
      if (row.vector.byteLength !== row.dimension * 4) continue;
      let members = byDimension.get(row.dimension);
      if (!members) byDimension.set(row.dimension, (members = { text: [], image: [] }));
      (row.kind === "image" ? members.image : members.text).push(row);
    }
    const groups = new Map<number, VectorGroup>();
    for (const [dimension, { text, image }] of byDimension) {
      const members = [...text, ...image];
      const matrix = new Float32Array(members.length * dimension);
      const bytes = new Uint8Array(matrix.buffer);
      members.forEach((row, index) => bytes.set(row.vector, index * dimension * 4));
      groups.set(dimension, {
        ids: members.map((row) => row.item_id),
        matrix,
        dimension,
        textRows: text.length,
      });
    }
    // A write that landed while this load ran leaves the next search to reload.
    if (generation === startedAt) vectorCache = { generation, signature, groups };
    return groups;
  });

  const rowsFor = (ids: ReadonlyArray<string>, where: Fragment) =>
    ids.length
      ? sql<ItemRow>`SELECT ${sql.literal(itemColumns)} FROM items
          WHERE id IN (SELECT value FROM json_each(${JSON.stringify(ids)})) AND ${where}`
      : Effect.succeed([] as ReadonlyArray<ItemRow>);

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
    generation += 1;
    vectorCache = null;
    yield* sql`INSERT INTO item_embeddings (item_id, kind, model, dimension, vector, created_at)
      VALUES (${itemId}, ${kind}, ${model}, ${dimension}, ${vector}, ${Date.now()})
      ON CONFLICT(item_id, kind) DO UPDATE SET model = excluded.model,
      dimension = excluded.dimension, vector = excluded.vector, created_at = excluded.created_at`;
    generation += 1;
    vectorCache = null;
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

    // Lexical hits rank above semantic-only ones: 2 plus their best similarity.
    const lexical = new Map(lexicalItems.map((item) => [item.id, -Infinity]));
    const ranked: Array<{ item: (typeof lexicalItems)[number]; score: number }> = [];
    const group = (yield* vectorGroups()).get(queryVector.length);
    if (group) {
      const total = group.ids.length;
      const scores = dotScores(group, queryVector, 0, total);
      for (let row = 0; row < total; row += 1) {
        const best = lexical.get(group.ids[row]);
        if (best !== undefined && scores[row] > best) lexical.set(group.ids[row], scores[row]);
      }
      // Semantic-only matches: read just the best few rows, widening only when
      // archived items crowd them out. An item's best vector (text or image) counts.
      const accept = (row: number) =>
        scores[row] >= semanticMatchFloor && !lexical.has(group.ids[row]);
      for (let k = cap + 16; ; k *= 4) {
        const top = topRows(scores, k, 0, total, accept);
        const best = new Map<string, number>();
        for (const row of top) if (!best.has(group.ids[row])) best.set(group.ids[row], scores[row]);
        const found = yield* rowsFor([...best.keys()], sql`archived = 0`);
        if (found.length >= cap || top.length < k) {
          for (const row of found)
            ranked.push({ item: itemFromRow(row), score: best.get(row.id)! });
          break;
        }
      }
    }
    for (const item of lexicalItems) {
      ranked.push({ item, score: 2 + Math.max(lexical.get(item.id) ?? 0, 0) });
    }

    return ranked
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
    const group = (yield* vectorGroups()).get(sourceVector.length);
    if (!group) return [] as LibraryCard[];
    const [from, to] = kind === "image" ? [group.textRows, group.ids.length] : [0, group.textRows];
    const scores = dotScores(group, sourceVector, from, to);
    const kinds =
      kind === "image" ? sql`kind = 'image'` : sql`kind IN ('article', 'url', 'note', 'quote')`;
    const cap = clampLimit(limit, 12, 50);
    const accept = (row: number) => group.ids[row] !== itemId;
    for (let k = cap + 8; ; k *= 4) {
      const top = topRows(scores, k, from, to, accept);
      const found = new Map(
        (yield* rowsFor(
          top.map((row) => group.ids[row]),
          sql`archived = 0 AND ${kinds}`,
        )).map((row) => [row.id, row]),
      );
      if (found.size >= cap || top.length < k) {
        return top
          .flatMap((row) => found.get(group.ids[row]) ?? [])
          .slice(0, cap)
          .map((row) => cardItem(itemFromRow(row)));
      }
    }
  });

  return { storeEmbedding, searchItems, searchSimilar, likeClause };
}
