import { Effect } from "effect";
import { readAsset, requireItem } from "./job-items.ts";
import { attempt, storageFailure } from "./storage/errors.ts";
import type { Job } from "./storage/jobs.ts";
import { IMAGE_PALETTE_JOB, JobQueue, Library } from "./storage/library.ts";
import type { createVideoPoster } from "./video-poster.ts";

export const imageThumbnail = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const jobs = yield* JobQueue;
  const item = yield* requireItem(job.itemId, "image");
  const image = yield* readAsset(item.localAssetPath);
  if (yield* library.storeImageThumbnail(item.id, image))
    yield* jobs.enqueue(item.id, IMAGE_PALETTE_JOB);
});

export const imagePalette = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId, "image");
  if (!item.thumbnailPath) return yield* storageFailure("image thumbnail is not ready");
  const thumbnail = yield* readAsset(item.thumbnailPath);
  const { dominantImageColors } = yield* attempt(() => import("./thumbnail.ts"));
  yield* library.storeImagePalette(item.id, yield* attempt(() => dominantImageColors(thumbnail)));
});

export const pdfThumbnail = Effect.fnUntraced(function* (job: Job) {
  const library = yield* Library;
  const item = yield* requireItem(job.itemId);
  const pdfBytes = yield* readAsset(item.localAssetPath);
  const { renderPdfFirstPage } = yield* attempt(() => import("./pdf.ts"));
  yield* library.storePdfThumbnail(item.id, yield* attempt(() => renderPdfFirstPage(pdfBytes)));
});

export const videoPoster = (options: Parameters<typeof createVideoPoster>[1]) =>
  Effect.fnUntraced(function* (job: Job) {
    const library = yield* Library;
    const item = yield* requireItem(job.itemId, "video");
    if (!item.localAssetPath) return yield* storageFailure("item has no local asset path");
    const path = yield* library.resolveAssetPath(item.localAssetPath);
    const { createVideoPoster } = yield* attempt(() => import("./video-poster.ts"));
    const poster = yield* attempt(() => createVideoPoster(path, options));
    if (!poster) return yield* storageFailure("no poster available for this video");
    yield* library.storeVideoPoster(item.id, poster);
  });
