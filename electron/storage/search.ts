import { Effect } from "effect";
import type { Fragment } from "effect/sql/Statement";
import type { StoredLibraryCard } from "@inkling/contracts";
import { IMAGE_MODEL, TEXT_MODEL } from "../embedding-contract.ts";
import { SEARCH_INDEX, cosine, rankFusion } from "../search-core.ts";
import { matchesVisualSubject, visualSubjectQuery } from "../visual-subject.ts";
import { selectCards, type StorageContext } from "./context.ts";
import { invalidInput } from "./errors.ts";
import { cardItem, clampLimit, type ItemRow, itemFromRow, qualifiedItemColumns } from "./shared.ts";

// Absolute safety floor plus a best-hit margin prevents a broad visual neighbourhood
// (for example dogs near a cat) from becoming an unbounded result lane.
export const searchFloors = { text: 0.7, image: 0.63, legacyText: 0.55, legacyImage: 0.55 };
const imageScoreMargin = 0.06;
export type SearchVectors = { current?: ArrayLike<number>; legacy?: ArrayLike<number> };
export type QueryVector = ArrayLike<number> | SearchVectors | null | undefined;
type EmbeddingRow = ItemRow & {
  embedding_dimension: number;
  embedding_vector: Uint8Array;
  embedding_kind: string;
};

export function escapeFtsQuery(query: string) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', "")}"`)
    .filter((token) => token !== '""')
    .join(" ");
}

function decodeFloatVector(blob: Uint8Array | null, dimension: number) {
  if (!blob || blob.byteLength !== dimension * 4) return null;
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return Array.from({ length: dimension }, (_, index) => bytes.readFloatLE(index * 4));
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
    if (kind !== "text" && kind !== "image")
      return yield* invalidInput("embedding kind must be text or image");
    const vector = Buffer.from(bytes);
    if (!Number.isInteger(dimension) || dimension < 1 || vector.length !== dimension * 4)
      return yield* invalidInput("embedding vector dimension does not match its bytes");
    yield* sql`INSERT INTO item_embeddings(item_id,kind,model,dimension,vector,created_at) VALUES(${itemId},${kind},${model},${dimension},${vector},${Date.now()}) ON CONFLICT(item_id,kind) DO UPDATE SET model = excluded.model,dimension = excluded.dimension,vector = excluded.vector,created_at = excluded.created_at`;
  });

  const searchItems = Effect.fnUntraced(function* (
    query: unknown,
    limit: unknown = 100,
    queryVector: QueryVector = null,
    scope: Fragment = sql`1 = 1`,
  ) {
    const search = String(query ?? "").trim(),
      cap = clampLimit(limit, 100, 200);
    if (!search) return yield* selectCards(ctx, sql`archived = 0`, cap);
    const subjects = visualSubjectQuery(search);
    let visibleSubjects: string[] = [];
    if (subjects) {
      const images = yield* sql<{
        id: string;
        title: string;
        ocr_text: string;
        caption: string | null;
        metadata: string;
      }>`SELECT i.id,i.title,i.ocr_text,i.metadata,a.caption FROM items i
        LEFT JOIN search_ai a ON a.item_id = i.id AND a.asset_path = i.local_asset_path
        WHERE i.kind = 'image' AND i.archived = 0 AND ${scope}
        ORDER BY i.updated_at DESC,i.id`;
      visibleSubjects = images
        .filter((row) => {
          let tags: string[] = [];
          try {
            const value: unknown = JSON.parse(row.metadata);
            if (value && typeof value === "object" && "tags" in value && Array.isArray(value.tags))
              tags = value.tags.filter((tag): tag is string => typeof tag === "string");
          } catch {
            /* Malformed user metadata cannot supply visual evidence. */
          }
          return matchesVisualSubject(
            { caption: row.caption, title: row.title, ocrText: row.ocr_text, tags },
            subjects,
          );
        })
        .map((row) => row.id);
      // Fence ALL lanes before their cap: OCR, filenames, text vectors and even
      // a high whole-screen image similarity cannot re-admit a rejected UI shot.
      scope = sql`(${scope}) AND (i.kind != 'image' OR i.id IN
        (SELECT value FROM json_each(${JSON.stringify(visibleSubjects)})))`;
    }
    let rows: ReadonlyArray<ItemRow> = [],
      chunkRows: ReadonlyArray<ItemRow> = [];
    if (ctx.fts5Enabled) {
      const match = escapeFtsQuery(search);
      if (match) {
        rows =
          yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM items_fts f JOIN items i ON i.id = f.item_id WHERE i.archived = 0 AND ${scope} AND items_fts MATCH ${match} ORDER BY bm25(items_fts),i.updated_at DESC LIMIT ${cap}`;
        chunkRows =
          yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM search_chunks_fts f JOIN items i ON i.id = f.item_id WHERE i.archived = 0 AND ${scope} AND EXISTS(SELECT 1 FROM search_index_state s WHERE s.item_id = i.id AND s.index_version = ${SEARCH_INDEX} AND s.revision = i.search_revision) AND search_chunks_fts MATCH ${match} ORDER BY bm25(search_chunks_fts) LIMIT ${cap}`;
      }
    } else {
      rows =
        yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM items i WHERE i.archived = 0 AND ${scope} AND ${likeClause(sqlLikePattern(search), "i.")} ORDER BY i.updated_at DESC LIMIT ${cap}`;
      chunkRows =
        yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)} FROM search_chunks c JOIN items i ON i.id = c.item_id WHERE i.archived = 0 AND ${scope} AND EXISTS(SELECT 1 FROM search_index_state s WHERE s.item_id = i.id AND s.index_version = ${SEARCH_INDEX} AND s.revision = i.search_revision) AND c.text COLLATE NOCASE LIKE ${sqlLikePattern(search)} ESCAPE char(92) LIMIT ${cap}`;
    }
    const items = new Map([...rows, ...chunkRows].map((row) => [row.id, itemFromRow(row)]));
    const lexical = [...items.keys()];
    const vectors: SearchVectors =
      queryVector && "length" in queryVector ? { legacy: queryVector } : (queryVector ?? {});
    const lanes = [
      { ids: lexical, weight: 2 },
      { ids: visibleSubjects, weight: 1.2 },
    ];
    const appendLane = (
      candidates: ReadonlyArray<EmbeddingRow>,
      vector: ArrayLike<number>,
      current: boolean,
    ) => {
      for (const kind of ["text", "image"] as const) {
        const scored = candidates
          .filter((row) => row.embedding_kind === kind)
          .flatMap((row) => {
            const stored = decodeFloatVector(row.embedding_vector, row.embedding_dimension);
            const score = stored ? cosine(vector, stored) : Number.NEGATIVE_INFINITY;
            const floor = current
              ? searchFloors[kind]
              : kind === "image"
                ? searchFloors.legacyImage
                : searchFloors.legacyText;
            if (score < floor) return [];
            items.set(row.id, itemFromRow(row));
            return [{ id: row.id, score }];
          })
          .sort((a, b) => b.score - a.score);
        const accepted =
          current && kind === "image" && scored.length
            ? scored.filter((entry) => entry.score >= scored[0].score - imageScoreMargin)
            : scored;
        lanes.push({ ids: accepted.map((entry) => entry.id), weight: kind === "image" ? 1.2 : 1 });
      }
    };
    if (vectors.current?.length) {
      const candidates =
        yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},e.dimension AS embedding_dimension,e.vector AS embedding_vector,e.kind AS embedding_kind FROM search_vectors e JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND ${scope} AND e.index_version = ${SEARCH_INDEX} AND e.revision = i.search_revision`;
      appendLane(candidates, vectors.current, true);
    }
    if (vectors.legacy?.length) {
      const candidates =
        yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},e.dimension AS embedding_dimension,e.vector AS embedding_vector,e.kind AS embedding_kind FROM item_embeddings e JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND ${scope} AND ((e.kind = 'text' AND e.model = ${TEXT_MODEL}) OR (e.kind = 'image' AND e.model = ${IMAGE_MODEL})) AND NOT EXISTS(SELECT 1 FROM search_index_state s WHERE s.item_id = i.id AND s.index_version = ${SEARCH_INDEX} AND s.revision = i.search_revision AND ${Number(Boolean(vectors.current?.length))} = 1)`;
      appendLane(candidates, vectors.legacy, false);
    }
    // Caption-derived subject IDs may have no lexical/vector row. Hydrate
    // every final winner instead of silently dropping that independent lane.
    const winnerIds = rankFusion(lanes, cap);
    if (!winnerIds.length) return [];
    const winners = yield* sql<ItemRow>`SELECT ${sql.literal(qualifiedItemColumns)}
      FROM items i WHERE i.archived = 0 AND i.id IN
        (SELECT value FROM json_each(${JSON.stringify(winnerIds)}))`;
    const byId = new Map(winners.map((row) => [row.id, cardItem(itemFromRow(row))]));
    return winnerIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  });

  const searchSimilar = Effect.fnUntraced(function* (
    itemId: string,
    kind: "image" | "text",
    limit: unknown = 12,
  ) {
    const [current] = yield* sql<{
      dimension: number;
      vector: Uint8Array;
    }>`SELECT e.dimension,e.vector FROM search_vectors e JOIN items i ON i.id = e.item_id WHERE e.item_id = ${itemId} AND e.kind = ${kind} AND e.index_version = ${SEARCH_INDEX} AND e.revision = i.search_revision ORDER BY e.chunk_id LIMIT 1`;
    const model = kind === "image" ? IMAGE_MODEL : TEXT_MODEL;
    const [legacy] = current
      ? []
      : yield* sql<{
          dimension: number;
          vector: Uint8Array;
        }>`SELECT dimension,vector FROM item_embeddings WHERE item_id = ${itemId} AND kind = ${kind} AND model = ${model}`;
    const source = current ?? legacy;
    if (!source) return [] as StoredLibraryCard[];
    const vector = decodeFloatVector(source.vector, source.dimension);
    if (!vector)
      return yield* invalidInput(`stored ${kind} embedding dimension does not match its vector`);
    const filter =
      kind === "image"
        ? sql`i.kind = 'image'`
        : sql`i.kind IN ('article','url','note','quote','pdf')`;
    const candidates = current
      ? yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},e.dimension AS embedding_dimension,e.vector AS embedding_vector FROM search_vectors e JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND i.id != ${itemId} AND ${filter} AND e.kind = ${kind} AND e.index_version = ${SEARCH_INDEX} AND e.revision = i.search_revision`
      : yield* sql<EmbeddingRow>`SELECT ${sql.literal(qualifiedItemColumns)},e.dimension AS embedding_dimension,e.vector AS embedding_vector FROM item_embeddings e JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND i.id != ${itemId} AND ${filter} AND e.kind = ${kind} AND e.model = ${model}`;
    const scored = candidates
      .flatMap((row) => {
        const stored = decodeFloatVector(row.embedding_vector, row.embedding_dimension);
        return stored ? [{ item: itemFromRow(row), score: cosine(vector, stored) }] : [];
      })
      .sort((a, b) => b.score - a.score);
    const unique = new Map(scored.map(({ item }) => [item.id, cardItem(item)]));
    return [...unique.values()].slice(0, clampLimit(limit, 12, 50));
  });
  return { storeEmbedding, searchItems, searchSimilar, likeClause };
}
