import { Effect } from "effect";
import { storageFailure } from "../storage/errors.ts";
import type { Job } from "../storage/jobs.ts";
import { IMAGE_PALETTE_JOB, JobQueue, Library } from "../storage/library.ts";
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
