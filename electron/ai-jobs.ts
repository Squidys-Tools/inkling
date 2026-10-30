import { join } from "node:path";
import { Duration, Effect } from "effect";
import { type Embeddings, generateEmbedding } from "./embedding-jobs.ts";
import { createEmbeddingEngine } from "./embeddings.ts";
import { createBackfill } from "./job-backfill.ts";
import { readAsset, reportProgress, requireItem } from "./job-items.ts";
import { createTesseractOcr } from "./ocr.ts";
import type { extractPdfTextByPages } from "./pdf.ts";
import type { UrlArticle } from "./storage/enrichment.ts";
import { attempt, storageFailure } from "./storage/errors.ts";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JobQueue,
  Library,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./storage/library.ts";
import type { Processor } from "./storage/worker.ts";

type Services = Library | JobQueue;
type Ocr = Pick<ReturnType<typeof createTesseractOcr>, "recognize"> & { close?: () => unknown };
type NativeImage = NonNullable<
  Parameters<typeof import("./video-poster.ts").createVideoPoster>[1]
>["nativeImage"];

// Generous ceilings that only a hung decoder, model, or fetch should reach.
// The first embedding job may also load the models from disk.
export const jobTimeouts = {
  [URL_ENRICHMENT_JOB]: Duration.minutes(2),
  [IMAGE_THUMBNAIL_JOB]: Duration.minutes(2),
  [VIDEO_POSTER_JOB]: Duration.minutes(2),
  [PDF_THUMBNAIL_JOB]: Duration.minutes(2),
  [IMAGE_PALETTE_JOB]: Duration.minutes(2),
  ocr_image: Duration.minutes(10),
  ocr_pdf_page: Duration.minutes(30),
  generate_embedding: Duration.minutes(30),
};

type AiJobOptions = {
  modelCacheDirectory: string;
  bundledModelDirectory?: string;
  ocr?: Ocr;
  embeddings?: Embeddings;
  extractPdf?: typeof extractPdfTextByPages;
  extractUrl?: (sourceUrl: string) => Promise<UrlArticle>;
  nativeImage?: NativeImage;
  videoDecoderPath?: string | null;
};

export function createAiJobProcessors({
  modelCacheDirectory,
  bundledModelDirectory,
  ocr = createTesseractOcr({ cacheDirectory: join(modelCacheDirectory, "tesseract") }),
  embeddings = createEmbeddingEngine(modelCacheDirectory, bundledModelDirectory),
  extractPdf,
  extractUrl = async (sourceUrl) => {
    const { ingestUrl } = await import("../src/lib/ingestion/url-ingestion.ts");
    return ingestUrl(sourceUrl);
  },
  nativeImage,
  videoDecoderPath,
}: AiJobOptions) {
  const backfill = createBackfill();

  const processors: Record<string, Processor<Services>> = {
    [URL_ENRICHMENT_JOB]: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      const item = yield* requireItem(job.itemId);
      const sourceUrl = item.sourceUrl;
      if (!sourceUrl) return yield* storageFailure("URL item has no source URL");
      const article = yield* attempt(() => extractUrl(sourceUrl));
      yield* library.applyUrlEnrichment(job.id, workerId, article);
    }),

    ocr_image: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      const jobs = yield* JobQueue;
      const item = yield* requireItem(job.itemId);
      yield* reportProgress(job, workerId, 0, 1, "Reading image");
      const image = yield* readAsset(item.localAssetPath);
      const text = (yield* attempt(() => ocr.recognize(image))).trim();
      if (text) {
        yield* library.storeOcrText(item.id, text, "tesseract.js");
        yield* jobs.enqueue(item.id, "generate_embedding");
        yield* reportProgress(job, workerId, 1, 1, "Image text indexed");
      } else {
        yield* reportProgress(job, workerId, 1, 1, "No text found");
      }
    }),

    ocr_pdf_page: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      const jobs = yield* JobQueue;
      const item = yield* requireItem(job.itemId);
      // pdf.js reports progress and the first page through callbacks, which run
      // back into this job's services.
      const run = Effect.runPromiseWith(yield* Effect.context<Services>());
      const extract = Effect.gen(function* () {
        const pdfBytes = yield* readAsset(item.localAssetPath);
        const extractPages =
          extractPdf ?? (yield* attempt(() => import("./pdf.ts"))).extractPdfTextByPages;
        return yield* attempt(() =>
          extractPages(pdfBytes, {
            recognize: (image) => ocr.recognize(image),
            onFirstPageThumbnail: item.thumbnailPath
              ? undefined
              : (png) => run(library.storePdfThumbnail(item.id, png)),
            onProgress: (current, total, message) =>
              run(Effect.ignore(reportProgress(job, workerId, current, total, message))),
          }),
        );
      });
      const resetThumbnailBackfill = library.getItem(item.id).pipe(
        Effect.flatMap((stored) =>
          stored?.thumbnailPath ? Effect.void : Effect.sync(backfill.rescanPdfThumbnails),
        ),
        Effect.ignore,
      );
      const result = yield* extract.pipe(Effect.ensuring(resetThumbnailBackfill));
      const pageCount = result.pages.length;
      if (result.text) {
        yield* library.storeOcrText(item.id, result.text, result.engine);
        yield* jobs.enqueue(item.id, "generate_embedding");
        yield* reportProgress(job, workerId, pageCount, pageCount, "PDF text indexed");
      } else {
        yield* reportProgress(job, workerId, pageCount, pageCount, "No text found");
      }
    }),

    [PDF_THUMBNAIL_JOB]: Effect.fnUntraced(function* (job) {
      const library = yield* Library;
      const item = yield* requireItem(job.itemId);
      const pdfBytes = yield* readAsset(item.localAssetPath);
      const { renderPdfFirstPage } = yield* attempt(() => import("./pdf.ts"));
      yield* library.storePdfThumbnail(item.id, yield* attempt(() => renderPdfFirstPage(pdfBytes)));
    }),

    [IMAGE_PALETTE_JOB]: Effect.fnUntraced(function* (job) {
      const library = yield* Library;
      const item = yield* requireItem(job.itemId, "image");
      if (!item.thumbnailPath) return yield* storageFailure("image thumbnail is not ready");
      const thumbnail = yield* readAsset(item.thumbnailPath);
      const { dominantImageColors } = yield* attempt(() => import("./thumbnail.ts"));
      yield* library.storeImagePalette(
        item.id,
        yield* attempt(() => dominantImageColors(thumbnail)),
      );
    }),

    generate_embedding: generateEmbedding(embeddings),
  };

  // A separate set because it runs on its own worker: a new card waits on these
  // jobs, and OCR or model loading can hold the main worker for minutes.
  const thumbnailProcessors: Record<string, Processor<Services>> = {
    [IMAGE_THUMBNAIL_JOB]: Effect.fnUntraced(function* (job) {
      const library = yield* Library;
      const jobs = yield* JobQueue;
      const item = yield* requireItem(job.itemId, "image");
      const image = yield* readAsset(item.localAssetPath);
      if (yield* library.storeImageThumbnail(item.id, image))
        yield* jobs.enqueue(item.id, IMAGE_PALETTE_JOB);
    }),

    [VIDEO_POSTER_JOB]: Effect.fnUntraced(function* (job) {
      const library = yield* Library;
      const item = yield* requireItem(job.itemId, "video");
      if (!item.localAssetPath) return yield* storageFailure("item has no local asset path");
      const path = yield* library.resolveAssetPath(item.localAssetPath);
      const { createVideoPoster } = yield* attempt(() => import("./video-poster.ts"));
      const poster = yield* attempt(() =>
        createVideoPoster(path, { nativeImage, decoderPath: videoDecoderPath }),
      );
      if (!poster) return yield* storageFailure("no poster available for this video");
      yield* library.storeVideoPoster(item.id, poster);
    }),
  };

  return {
    processors,
    thumbnailProcessors,
    onIdle: backfill.onIdle,
    embedQuery: async (text: string) => (await embeddings.embedQuery(text)).vector,
    close: async () => {
      await ocr.close?.();
    },
  };
}
