import { Effect } from "effect";
import { readItem, type StorageContext } from "./context.ts";
import { invalidInput } from "./errors.ts";
import {
  CAPTION_MODEL,
  SEARCH_INDEX,
  normalizedVector,
  textChunks,
  type SearchChunk,
} from "../search-core.ts";
import { floatVectorBytes } from "../embeddings.ts";

type AiRow = {
  model: string;
  asset_path: string;
  caption: string;
  tags: string;
  removed_tags: string;
};
type VectorInput = { kind: "text" | "image"; chunkId: string; vector: Float32Array };

function stringArray(value: string) {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
}

export function makeSearchIndex(ctx: StorageContext) {
  const { sql, jobs } = ctx;
  const revision = (id: string) =>
    sql<{ search_revision: number }>`SELECT search_revision FROM items WHERE id = ${id}`.pipe(
      Effect.map(([row]) => row?.search_revision),
    );
  const getSearchAnnotation = Effect.fnUntraced(function* (id: string) {
    const [row] = yield* sql<AiRow>`SELECT * FROM search_ai WHERE item_id = ${id}`;
    if (!row) return null;
    const removed = new Set(stringArray(row.removed_tags));
    return {
      model: row.model,
      assetPath: row.asset_path,
      caption: row.caption,
      tags: stringArray(row.tags).filter((tag) => !removed.has(tag)),
    };
  });
  const searchInput = (id: string) =>
    sql.withTransaction(
      Effect.gen(function* () {
        const item = yield* readItem(ctx, id);
        if (!item) return null;
        const currentRevision = yield* revision(id);
        const ai = yield* getSearchAnnotation(id);
        const pages = yield* sql<{
          page: number;
          text: string;
        }>`SELECT page,text FROM search_pages WHERE item_id = ${id} AND asset_path = ${item.localAssetPath} ORDER BY page`;
        const metadataTags = Array.isArray(item.metadata.tags)
          ? item.metadata.tags.filter((tag): tag is string => typeof tag === "string")
          : [];
        const annotation = ai?.assetPath === item.localAssetPath ? ai : null;
        const header = [
          item.title,
          ...metadataTags,
          annotation?.caption,
          ...(annotation?.tags ?? []),
          item.description,
          item.body,
          item.metadata.text,
          item.metadata.extractedText,
        ]
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .join("\n\n");
        const chunks = textChunks(header, "content");
        if (pages.length)
          for (const page of pages) chunks.push(...textChunks(page.text, "pdf", page.page));
        else chunks.push(...textChunks(item.ocrText, "ocr"));
        return { item, revision: currentRevision ?? 0, chunks };
      }),
    );
  const cachedSearchImage = Effect.fnUntraced(function* (id: string, hash: string) {
    const [row] = yield* sql<{
      vector: Uint8Array;
    }>`SELECT vector FROM search_vectors WHERE item_id = ${id} AND index_version = ${SEARCH_INDEX} AND kind = 'image' AND chunk_id = ${`image:${hash}`}`;
    if (!row || row.vector.byteLength !== 768 * 4) return null;
    const bytes = Buffer.from(row.vector);
    return normalizedVector(
      Float32Array.from({ length: 768 }, (_, index) => bytes.readFloatLE(index * 4)),
    );
  });
  const storeSearchImage = Effect.fnUntraced(function* (
    id: string,
    expectedRevision: number,
    vector: Float32Array,
    hash: string,
  ) {
    const normalized = normalizedVector(vector);
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        if ((yield* revision(id)) !== expectedRevision) return false;
        yield* sql`INSERT INTO search_vectors(item_id,index_version,kind,chunk_id,revision,dimension,vector) VALUES(${id},${SEARCH_INDEX},'image',${`image:${hash}`},${expectedRevision},${normalized.length},${floatVectorBytes(normalized)}) ON CONFLICT(item_id,index_version,kind,chunk_id) DO UPDATE SET revision = excluded.revision,dimension = excluded.dimension,vector = excluded.vector`;
        return true;
      }),
    );
  });
  const storeSearchIndex = Effect.fnUntraced(function* (
    id: string,
    expectedRevision: number,
    chunks: SearchChunk[],
    vectors: VectorInput[],
    index = SEARCH_INDEX,
  ) {
    const validated = vectors.map((value) => ({
      ...value,
      vector: normalizedVector(value.vector),
    }));
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        if ((yield* revision(id)) !== expectedRevision) return false;
        yield* sql`DELETE FROM search_chunks WHERE item_id = ${id}`;
        for (const chunk of chunks)
          yield* sql`INSERT INTO search_chunks(item_id,chunk_id,source,page,text,hash) VALUES(${id},${chunk.id},${chunk.source},${chunk.page},${chunk.text},${chunk.hash})`;
        yield* sql`DELETE FROM search_vectors WHERE item_id = ${id} AND index_version = ${index}`;
        for (const value of validated)
          yield* sql`INSERT INTO search_vectors(item_id,index_version,kind,chunk_id,revision,dimension,vector) VALUES(${id},${index},${value.kind},${value.chunkId},${expectedRevision},${value.vector.length},${floatVectorBytes(value.vector)})`;
        yield* sql`INSERT INTO search_index_state(item_id,index_version,revision) VALUES(${id},${index},${expectedRevision}) ON CONFLICT(item_id,index_version) DO UPDATE SET revision = excluded.revision`;
        return true;
      }),
    );
  });
  const storePdfPages = Effect.fnUntraced(function* (
    id: string,
    assetPath: string | null,
    pages: string[],
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const item = yield* readItem(ctx, id);
        if (!item || item.localAssetPath !== assetPath) return false;
        yield* sql`DELETE FROM search_pages WHERE item_id = ${id}`;
        for (const [index, text] of pages.entries())
          yield* sql`INSERT INTO search_pages(item_id,asset_path,page,text) VALUES(${id},${assetPath},${index + 1},${text})`;
        yield* sql`UPDATE items SET search_revision = search_revision + 1 WHERE id = ${id}`;
        return true;
      }),
    );
  });
  const storeSearchAnnotation = Effect.fnUntraced(function* (
    id: string,
    assetPath: string,
    caption: string,
    tags: string[],
  ) {
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const item = yield* readItem(ctx, id);
        if (item?.kind !== "image" || item.localAssetPath !== assetPath) return false;
        yield* sql`INSERT INTO search_ai(item_id,model,asset_path,caption,tags) VALUES(${id},${CAPTION_MODEL},${assetPath},${caption.slice(0, 1200)},${JSON.stringify(tags.slice(0, 12))}) ON CONFLICT(item_id) DO UPDATE SET model = excluded.model, asset_path = excluded.asset_path, caption = excluded.caption, tags = excluded.tags`;
        yield* sql`UPDATE items SET search_revision = search_revision + 1 WHERE id = ${id}`;
        // Caption/tag edits do not change image bytes. Keep the already-indexed
        // image searchable while the revised text index is rebuilt in the queue.
        yield* sql`UPDATE search_vectors SET revision = (SELECT search_revision FROM items WHERE id = ${id}) WHERE item_id = ${id} AND index_version = ${SEARCH_INDEX} AND kind = 'image'`;
        yield* jobs.enqueue(id, "generate_embedding");
        yield* jobs.notify(id);
        return true;
      }),
    );
  });
  const removeSearchTag = Effect.fnUntraced(function* (id: string, tag: string) {
    const clean = tag.trim().toLowerCase();
    if (!clean || clean.length > 120) return yield* invalidInput("invalid derived tag");
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const [row] = yield* sql<AiRow>`SELECT * FROM search_ai WHERE item_id = ${id}`;
        if (!row) return;
        const removed = [...new Set([...stringArray(row.removed_tags), clean])];
        yield* sql`UPDATE search_ai SET removed_tags = ${JSON.stringify(removed)} WHERE item_id = ${id}`;
        yield* sql`UPDATE items SET search_revision = search_revision + 1 WHERE id = ${id}`;
        // Caption/tag edits do not change image bytes. Keep the already-indexed
        // image searchable while the revised text index is rebuilt in the queue.
        yield* sql`UPDATE search_vectors SET revision = (SELECT search_revision FROM items WHERE id = ${id}) WHERE item_id = ${id} AND index_version = ${SEARCH_INDEX} AND kind = 'image'`;
        yield* jobs.enqueue(id, "generate_embedding");
        yield* jobs.notify(id);
      }),
    );
    return yield* getSearchAnnotation(id);
  });
  const nextSearchCandidate = () =>
    sql<{
      id: string;
    }>`SELECT i.id FROM items i LEFT JOIN search_index_state s ON s.item_id = i.id AND s.index_version = ${SEARCH_INDEX} WHERE i.archived = 0 AND (s.revision IS NULL OR s.revision != i.search_revision) AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.item_id = i.id AND j.kind = 'generate_embedding' AND j.status IN ('pending','processing','failed')) ORDER BY i.created_at DESC LIMIT 1`.pipe(
      Effect.map(([row]) => row),
    );
  const nextCaptionCandidate = () =>
    sql<{
      id: string;
    }>`SELECT i.id FROM items i LEFT JOIN search_ai a ON a.item_id = i.id WHERE i.archived = 0 AND i.kind = 'image' AND (a.item_id IS NULL OR a.asset_path != i.local_asset_path OR a.model != ${CAPTION_MODEL}) AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.item_id = i.id AND j.kind = 'caption_image' AND j.status IN ('pending','processing','failed')) ORDER BY i.created_at DESC LIMIT 1`.pipe(
      Effect.map(([row]) => row),
    );
  const searchIndexProgress = () =>
    sql<{
      total: number;
      ready: number;
    }>`SELECT COUNT(*) AS total,COALESCE(SUM(CASE WHEN s.revision = i.search_revision THEN 1 ELSE 0 END),0) AS ready FROM items i LEFT JOIN search_index_state s ON s.item_id = i.id AND s.index_version = ${SEARCH_INDEX} WHERE i.archived = 0`.pipe(
      Effect.map(([row]) => ({ ...row, index: SEARCH_INDEX })),
    );
  return {
    searchInput,
    cachedSearchImage,
    storeSearchImage,
    storeSearchIndex,
    storePdfPages,
    getSearchAnnotation,
    storeSearchAnnotation,
    removeSearchTag,
    nextSearchCandidate,
    nextCaptionCandidate,
    searchIndexProgress,
  };
}
