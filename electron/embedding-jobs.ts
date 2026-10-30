import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import type { StoredLibraryItemDetail } from "@inkling/contracts";
import { IMAGE_MODEL } from "./embedding-contract.ts";
import type { createEmbeddingEngine } from "./embeddings.ts";
import { readAsset, reportProgress, requireItem } from "./job-items.ts";
import { attempt } from "./storage/errors.ts";
import { JobQueue, Library, markdownToPlainText } from "./storage/library.ts";
import type { Processor } from "./storage/worker.ts";

export type Embeddings = Pick<
  ReturnType<typeof createEmbeddingEngine>,
  "embedText" | "embedQuery" | "embedImage"
>;

export function embeddingText(
  item: Pick<
    StoredLibraryItemDetail,
    "title" | "description" | "body" | "bodyFormat" | "ocrText" | "metadata"
  >,
) {
  const bodyValue = item.body.trim();
  const body = bodyValue
    ? item.bodyFormat === "md"
      ? markdownToPlainText(bodyValue)
      : bodyValue
    : null;
  const parts = [item.title, body ?? item.description, item.ocrText]
    .map((value) => value?.trim())
    .filter(Boolean);

  if (body == null) {
    for (const key of ["text", "extractedText"]) {
      const value = String(item.metadata[key] ?? "").trim();
      if (value) parts.push(value);
    }
  }

  return parts.length ? parts.join("\n\n") : null;
}

export const enqueueStaleImageEmbeddings = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const jobs = yield* JobQueue;
  const items = yield* sql<{ item_id: string }>`SELECT e.item_id FROM item_embeddings e
    JOIN items i ON i.id = e.item_id
    WHERE e.kind = 'image' AND e.model != ${IMAGE_MODEL} AND i.kind = 'image'`;
  yield* Effect.forEach(items, (item) => jobs.enqueue(item.item_id, "generate_embedding"), {
    discard: true,
  });
  return items.length;
});

export const generateEmbedding = (embeddings: Embeddings): Processor<Library | JobQueue> =>
  Effect.fnUntraced(function* (job, workerId) {
    const library = yield* Library;
    const item = yield* requireItem(job.itemId);
    const text = embeddingText(item);
    const total = Number(Boolean(text)) + Number(item.kind === "image");
    yield* reportProgress(job, workerId, 0, total, "Loading local Nomic embedding models");
    let current = 0;

    if (text) {
      const embedding = yield* attempt(() => embeddings.embedText(text));
      yield* library.storeEmbedding(
        item.id,
        "text",
        embedding.model,
        embedding.bytes,
        embedding.vector.length,
      );
      current += 1;
      yield* reportProgress(job, workerId, current, total, "Text search index ready");
    }

    if (item.kind === "image") {
      const image = yield* readAsset(item.localAssetPath);
      const embedding = yield* attempt(() => embeddings.embedImage(image));
      yield* library.storeEmbedding(
        item.id,
        "image",
        embedding.model,
        embedding.bytes,
        embedding.vector.length,
      );
      yield* reportProgress(job, workerId, current + 1, total, "Image similarity index ready");
    }
  });
