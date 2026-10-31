import { Effect } from "effect";
import { SqlClient } from "effect/sql";
import { IMAGE_MODEL } from "@inkling/contracts/jobs";
import type { ItemDetail } from "@inkling/contracts";
import { JobQueue, Library, markdownToPlainText } from "../storage/library.ts";
import type { Processor } from "../storage/worker.ts";
import { assetPath, reportProgress, requireItem } from "./job-items.ts";
import { JobsWorker, workerClient } from "./worker-client.ts";

export function embeddingText(
  item: Pick<ItemDetail, "title" | "description" | "body" | "bodyFormat" | "ocrText" | "metadata">,
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

export const generateEmbedding: Processor<Library | JobQueue | JobsWorker> = Effect.fnUntraced(
  function* (job, workerId) {
    const library = yield* Library;
    const worker = yield* workerClient;
    const item = yield* requireItem(job.itemId);
    const text = embeddingText(item);
    const total = Number(Boolean(text)) + Number(item.kind === "image");
    yield* reportProgress(job, workerId, 0, total, "Loading local Nomic embedding models");
    let current = 0;

    if (text) {
      const { model, bytes, dimension } = yield* worker.embedText({ text });
      yield* library.storeEmbedding(item.id, "text", model, bytes, dimension);
      current += 1;
      yield* reportProgress(job, workerId, current, total, "Text search index ready");
    }

    if (item.kind === "image") {
      const path = yield* assetPath(item.localAssetPath);
      const { model, bytes, dimension } = yield* worker.embedImage({ path });
      yield* library.storeEmbedding(item.id, "image", model, bytes, dimension);
      yield* reportProgress(job, workerId, current + 1, total, "Image similarity index ready");
    }
  },
);
