import { join } from "node:path";
import { Duration, Effect } from "effect";
import { type Embeddings, generateEmbedding } from "./embedding-jobs.ts";
import { createEmbeddingEngine } from "./embeddings.ts";
import { createBackfill } from "./job-backfill.ts";
import { readAsset, reportProgress, requireItem } from "./job-items.ts";
import { imagePalette, imageThumbnail, pdfThumbnail, videoPoster } from "./media-jobs.ts";
import { createTesseractOcr } from "./ocr.ts";
import { createSearchModels } from "./search-models.ts";
import { captionImage, generateSearchEmbedding } from "./search-jobs.ts";
import type { SearchVectors } from "./storage/search.ts";
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
import type { Thumbnailer } from "./video-poster.ts";

type Services = Library | JobQueue;
type Ocr = Pick<ReturnType<typeof createTesseractOcr>, "recognize"> & { close?: () => unknown };

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
  searchModels?: ReturnType<typeof createSearchModels> | null;
  extractPdf?: typeof extractPdfTextByPages;
  extractUrl?: (sourceUrl: string) => Promise<UrlArticle>;
  nativeImage?: Thumbnailer;
  videoDecoderPath?: string | null;
};

export function createAiJobProcessors({
  modelCacheDirectory,
  bundledModelDirectory,
  ocr = createTesseractOcr({ cacheDirectory: join(modelCacheDirectory, "tesseract") }),
  embeddings: providedEmbeddings,
  searchModels: providedSearchModels,
  extractPdf,
  extractUrl = async (sourceUrl) => {
    const { ingestUrl } = await import("../src/lib/ingestion/url-ingestion.ts");
    return ingestUrl(sourceUrl);
  },
  nativeImage,
  videoDecoderPath,
}: AiJobOptions) {
  const embeddings =
    providedEmbeddings ?? createEmbeddingEngine(modelCacheDirectory, bundledModelDirectory);
  const searchModels =
    providedSearchModels === undefined
      ? providedEmbeddings
        ? null
        : createSearchModels(modelCacheDirectory, bundledModelDirectory)
      : providedSearchModels;
  const backfill = createBackfill(Boolean(searchModels));

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
        yield* library.storeOcrText(item.id, text, "tesseract.js", item.localAssetPath);
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
      if (
        searchModels &&
        !(yield* library.storePdfPages(item.id, item.localAssetPath, result.pages))
      )
        return;
      if (result.text) {
        yield* library.storeOcrText(item.id, result.text, result.engine, item.localAssetPath);
        yield* jobs.enqueue(item.id, "generate_embedding");
        yield* reportProgress(job, workerId, pageCount, pageCount, "PDF text indexed");
      } else {
        yield* reportProgress(job, workerId, pageCount, pageCount, "No text found");
      }
    }),
    [PDF_THUMBNAIL_JOB]: pdfThumbnail,
    [IMAGE_PALETTE_JOB]: imagePalette,
    ...(searchModels ? { caption_image: captionImage(searchModels) } : {}),
    generate_embedding: searchModels
      ? generateSearchEmbedding(searchModels)
      : generateEmbedding(embeddings),
  };
  // Card images must not wait for OCR or model loading on the main worker.
  const thumbnailProcessors: Record<string, Processor<Services>> = {
    [IMAGE_THUMBNAIL_JOB]: imageThumbnail,
    [VIDEO_POSTER_JOB]: videoPoster({ nativeImage, decoderPath: videoDecoderPath }),
  };
  return {
    processors,
    thumbnailProcessors,
    onIdle: backfill.onIdle,
    embedQuery: async (text: string) => (await embeddings.embedQuery(text)).vector,
    queryVectors: async (text: string) => {
      const vectors: SearchVectors = {};
      const failures: string[] = [];
      if (searchModels) {
        try {
          vectors.current = await searchModels.embedQuery(text);
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error));
        }
      }
      try {
        vectors.legacy = (await embeddings.embedQuery(text)).vector;
      } catch (error) {
        if (!vectors.current) failures.push(error instanceof Error ? error.message : String(error));
      }
      return {
        vectors,
        status: vectors.current
          ? ("ready" as const)
          : vectors.legacy
            ? ("fallback" as const)
            : ("unavailable" as const),
        message: failures.length
          ? "Visual search is unavailable; showing available text matches."
          : null,
      };
    },
    close: async () => {
      await searchModels?.close();
      await ocr.close?.();
    },
  };
}
