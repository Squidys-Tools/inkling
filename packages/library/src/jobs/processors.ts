import { Duration, Effect, Stream } from "effect";
import { storageFailure } from "../storage/errors.ts";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JobQueue,
  Library,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "../storage/library.ts";
import type { Processor } from "../storage/worker.ts";
import { generateEmbedding } from "./embedding-jobs.ts";
import { createBackfill } from "./job-backfill.ts";
import { assetPath, reportProgress, requireItem } from "./job-items.ts";
import { imagePalette, imageThumbnail, pdfThumbnail, videoPoster } from "./media-jobs.ts";
import { type JobsWorker, workerClient } from "./worker-client.ts";

type Services = Library | JobQueue | JobsWorker;

// Generous ceilings that only a hung decoder, model, or fetch should reach.
// The first embedding job may also load the models from disk. Four lanes can
// share as few as two OCR workers, which can make an OCR job take three times
// as long as alone, so OCR ceilings are three times a lone job's.
export const jobTimeouts = {
  [URL_ENRICHMENT_JOB]: Duration.minutes(2),
  [IMAGE_THUMBNAIL_JOB]: Duration.minutes(2),
  [VIDEO_POSTER_JOB]: Duration.minutes(2),
  [PDF_THUMBNAIL_JOB]: Duration.minutes(2),
  [IMAGE_PALETTE_JOB]: Duration.minutes(2),
  ocr_image: Duration.minutes(30),
  ocr_pdf_page: Duration.minutes(90),
  generate_embedding: Duration.minutes(30),
};

export function createJobProcessors() {
  const backfill = createBackfill();

  const processors: Record<string, Processor<Services>> = {
    [URL_ENRICHMENT_JOB]: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      const item = yield* requireItem(job.itemId);
      const sourceUrl = item.sourceUrl;
      if (!sourceUrl) return yield* storageFailure("URL item has no source URL");
      const article = yield* (yield* workerClient).extractUrl({ url: sourceUrl });
      yield* library.applyUrlEnrichment(job.id, workerId, article);
    }),

    ocr_image: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      const jobs = yield* JobQueue;
      const item = yield* requireItem(job.itemId);
      yield* reportProgress(job, workerId, 0, 1, "Reading image");
      const path = yield* assetPath(item.localAssetPath);
      const text = yield* (yield* workerClient).recognizeImage({ path });
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
      const path = yield* assetPath(item.localAssetPath);
      const read = (yield* workerClient).readPdf({ path, firstPageThumbnail: !item.thumbnailPath });
      let result: { text: string; engine: string; pageCount: number } | undefined;
      // A page-one thumbnail that fails to store must not cost the PDF its text.
      const extract = Stream.runForEach(read, (event) => {
        switch (event._tag) {
          case "Progress":
            return Effect.ignore(
              reportProgress(job, workerId, event.current, event.total, event.message),
            );
          case "FirstPage":
            return Effect.ignore(library.storePdfThumbnail(item.id, event.thumbnail));
          case "Text":
            return Effect.sync(() => {
              result = event;
            });
        }
      });
      const resetThumbnailBackfill = library.getItem(item.id).pipe(
        Effect.flatMap((stored) =>
          stored?.thumbnailPath ? Effect.void : Effect.sync(backfill.rescanPdfThumbnails),
        ),
        Effect.ignore,
      );
      yield* extract.pipe(Effect.ensuring(resetThumbnailBackfill));
      if (!result) return yield* storageFailure("the worker finished the PDF without its text");
      const { text, engine, pageCount } = result;
      if (text) {
        yield* library.storeOcrText(item.id, text, engine);
        yield* jobs.enqueue(item.id, "generate_embedding");
        yield* reportProgress(job, workerId, pageCount, pageCount, "PDF text indexed");
      } else {
        yield* reportProgress(job, workerId, pageCount, pageCount, "No text found");
      }
    }),

    [PDF_THUMBNAIL_JOB]: pdfThumbnail,
    [IMAGE_PALETTE_JOB]: imagePalette,
    generate_embedding: generateEmbedding,
  };

  // A separate set because it runs on its own lane: a new card waits on these
  // jobs, and OCR or model loading can hold the main lane for minutes.
  const thumbnailProcessors: Record<string, Processor<Services>> = {
    [IMAGE_THUMBNAIL_JOB]: imageThumbnail,
    [VIDEO_POSTER_JOB]: videoPoster,
  };

  return { processors, thumbnailProcessors, onIdle: backfill.onIdle };
}
