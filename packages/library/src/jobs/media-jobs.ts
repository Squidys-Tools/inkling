import type { Job } from "@inkling/contracts";
import { missingXPostMedia } from "@inkling/ingestion/x-post-media";
import { Effect } from "effect";
import { type XPostMediaFile, xPostOf } from "../storage/enrichment.ts";
import { storageFailure } from "../storage/errors.ts";
import { IMAGE_PALETTE_JOB, JobQueue } from "../storage/jobs.ts";
import { Library } from "../storage/library.ts";
import { assetPath, requireItem } from "./job-items.ts";
import { workerClient } from "./worker-client.ts";

export const imageThumbnail = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const jobs = yield* JobQueue;
  const item = yield* requireItem(job.itemId, "image");
  if (item.thumbnailPath) return;
  const path = yield* assetPath(item.localAssetPath);
  const thumbnail = yield* (yield* workerClient).imageThumbnail({ path });
  if (yield* library.storeImageThumbnail(item.id, thumbnail))
    yield* jobs.enqueue(item.id, IMAGE_PALETTE_JOB);
});

export const imagePalette = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId, "image");
  if (!item.thumbnailPath) return yield* storageFailure("image thumbnail is not ready");
  const path = yield* assetPath(item.thumbnailPath);
  yield* library.storeImagePalette(item.id, yield* (yield* workerClient).imagePalette({ path }));
});

export const pdfThumbnail = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId);
  if (item.thumbnailPath) return;
  const path = yield* assetPath(item.localAssetPath);
  yield* library.storePdfThumbnail(item.id, yield* (yield* workerClient).pdfThumbnail({ path }));
});

export const videoPoster = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId, "video");
  if (item.thumbnailPath) return;
  const path = yield* assetPath(item.localAssetPath);
  const poster = yield* (yield* workerClient).videoPoster({ path });
  if (!poster) return yield* storageFailure("no poster available for this video");
  yield* library.storeVideoPoster(item.id, poster);
});

// Pictures that answer with something else, or that X refuses outright, are skipped; a
// network failure keeps what did arrive and fails, so the retry fetches only the rest.
export const xPostMedia = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId);
  const social = xPostOf(item.metadata);
  if (!social) return;
  const worker = yield* workerClient;
  const files: XPostMediaFile[] = [];
  let missed = 0;
  for (const { slot, url } of missingXPostMedia(social)) {
    const bytes = yield* worker.downloadXMedia({ url }).pipe(
      Effect.catchTag("WorkerError", (error) => {
        if (!error.permanent) missed++;
        return Effect.succeed(null);
      }),
    );
    if (bytes) files.push({ slot, url, bytes });
  }
  if (files.length > 0) yield* library.storeXPostMedia(item.id, files);
  if (missed > 0) return yield* storageFailure(`${missed} post pictures could not be downloaded`);
});
