import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Duration, Effect } from "effect";
import { SqlClient } from "effect/sql";
import type { StoredLibraryItemDetail } from "@inkling/contracts";
import { IMAGE_MODEL } from "./embedding-contract.ts";
import { createEmbeddingEngine } from "./embeddings.ts";
import { createTesseractOcr } from "./ocr.ts";
import { createSearchModels } from "./search-models.ts";
import { captionTags, contentHash } from "./search-core.ts";
import type { SearchVectors } from "./storage/search.ts";
import type { extractPdfTextByPages } from "./pdf.ts";
import type { UrlArticle } from "./storage/enrichment.ts";
import { attempt, storageFailure } from "./storage/errors.ts";
import type { Job } from "./storage/jobs.ts";
import {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JobQueue,
  Library,
  markdownToPlainText,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./storage/library.ts";
import type { Processor } from "./storage/worker.ts";

type Services = Library | JobQueue;
type Ocr = Pick<ReturnType<typeof createTesseractOcr>, "recognize"> & { close?: () => unknown };
type Embeddings = Pick<
  ReturnType<typeof createEmbeddingEngine>,
  "embedText" | "embedQuery" | "embedImage"
>;
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

export function embeddingText(
  item: Pick<
    StoredLibraryItemDetail,
    "title" | "description" | "body" | "bodyFormat" | "ocrText" | "metadata"
  >,
) {
  const bodyValue = String(item.body ?? "").trim();
  const body = bodyValue
    ? item.bodyFormat === "md"
      ? markdownToPlainText(bodyValue)
      : bodyValue
    : null;
  const description = body ?? item.description;
  const parts = [item.title, description, item.ocrText]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (body == null) {
    for (const key of ["text", "extractedText"]) {
      const value = String(item.metadata?.[key] ?? "").trim();
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

const requireItem = Effect.fnUntraced(function* (id: string, kind?: string) {
  const library = yield* Library;
  const item = yield* library.getItem(id);
  if (!item || (kind && item.kind !== kind))
    return yield* storageFailure(kind ? `${kind} item not found` : "item not found");
  return item;
});

const readAsset = Effect.fnUntraced(function* (assetPath: string | null) {
  if (!assetPath) return yield* storageFailure("item has no local asset path");
  const library = yield* Library;
  const path = yield* library.resolveAssetPath(assetPath);
  return yield* attempt(() => readFile(path));
});

export type AiJobOptions = {
  modelCacheDirectory: string;
  bundledModelDirectory?: string;
  ocr?: Ocr;
  embeddings?: Embeddings;
  searchModels?: ReturnType<typeof createSearchModels> | null;
  extractPdf?: typeof extractPdfTextByPages;
  extractUrl?: (sourceUrl: string) => Promise<UrlArticle>;
  nativeImage?: NativeImage;
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
    providedEmbeddings ??
    createEmbeddingEngine(modelCacheDirectory, undefined, bundledModelDirectory);
  const searchModels =
    providedSearchModels === undefined
      ? providedEmbeddings
        ? null
        : createSearchModels(modelCacheDirectory, bundledModelDirectory)
      : providedSearchModels;
  let thumbnailCursor = 0;
  let thumbnailBackfillDone = false;
  let paletteCursor = 0;
  let paletteBackfillDone = false;
  let posterCursor = 0;
  let posterBackfillDone = false;

  const progress = (
    job: Job,
    workerId: string,
    current: number,
    total: number | null,
    message: string,
  ) => JobQueue.use((jobs) => jobs.updateProgress(job.id, workerId, current, total, message));

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
      yield* progress(job, workerId, 0, 1, "Reading image");
      const image = yield* readAsset(item.localAssetPath);
      const text = (yield* attempt(() => ocr.recognize(image))).trim();
      if (text) {
        yield* library.storeOcrText(item.id, text, "tesseract.js", item.localAssetPath);
        yield* jobs.enqueue(item.id, "generate_embedding");
        yield* progress(job, workerId, 1, 1, "Image text indexed");
      } else {
        yield* progress(job, workerId, 1, 1, "No text found");
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
              run(Effect.ignore(progress(job, workerId, current, total, message))),
          }),
        );
      });
      const resetThumbnailBackfill = library.getItem(item.id).pipe(
        Effect.flatMap((stored) =>
          stored?.thumbnailPath
            ? Effect.void
            : Effect.sync(() => {
                thumbnailCursor = 0;
                thumbnailBackfillDone = false;
              }),
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
        yield* progress(job, workerId, pageCount, pageCount, "PDF text indexed");
      } else {
        yield* progress(job, workerId, pageCount, pageCount, "No text found");
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

    caption_image: Effect.fnUntraced(function* (job, workerId) {
      if (!searchModels) return;
      const library = yield* Library;
      const item = yield* requireItem(job.itemId, "image");
      if (!item.localAssetPath) return;
      yield* progress(job, workerId, 0, 1, "Describing image locally");
      const image = yield* readAsset(item.localAssetPath);
      const caption = yield* attempt(() => searchModels.caption(image));
      yield* library.storeSearchAnnotation(
        item.id,
        item.localAssetPath,
        caption,
        captionTags(caption),
      );
      yield* progress(job, workerId, 1, 1, "Description indexed");
    }),

    generate_embedding: Effect.fnUntraced(function* (job, workerId) {
      const library = yield* Library;
      if (searchModels) {
        const input = yield* library.searchInput(job.itemId);
        if (!input) return;
        const vectors: { kind: "text" | "image"; chunkId: string; vector: Float32Array }[] = [];
        const total = input.chunks.length + Number(input.item.kind === "image");
        let current = 0;
        yield* progress(job, workerId, 0, total, "Loading local search models");
        if (input.item.kind === "image") {
          const image = yield* readAsset(input.item.localAssetPath);
          const hash = contentHash(image);
          const cached = yield* library.cachedSearchImage(input.item.id, hash);
          const vector = cached ?? (yield* attempt(() => searchModels.embedImage(image)));
          vectors.push({ kind: "image", chunkId: `image:${hash}`, vector });
          yield* library.storeSearchImage(input.item.id, input.revision, vector, hash);
          current += 1;
          yield* progress(job, workerId, current, total, "Image search ready");
        }
        for (const chunk of input.chunks) {
          const vector = yield* attempt(() =>
            searchModels.embedText(chunk.text, input.item.title ?? undefined),
          );
          vectors.push({ kind: "text", chunkId: chunk.id, vector });
          current += 1;
          yield* progress(job, workerId, current, total, "Indexing document passages");
        }
        yield* library.storeSearchIndex(input.item.id, input.revision, input.chunks, vectors);
        return;
      }
      const item = yield* requireItem(job.itemId);
      const text = embeddingText(item);
      const total = Number(Boolean(text)) + Number(item.kind === "image");
      yield* progress(job, workerId, 0, total, "Loading local Nomic embedding models");
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
        yield* progress(job, workerId, current, total, "Text search index ready");
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
        yield* progress(job, workerId, current + 1, total, "Image similarity index ready");
      }
    }),
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

  // Each idle pass queues at most one backfill job, so a large library catches
  // up a card at a time without crowding out new captures.
  const onIdle = Effect.fnUntraced(function* () {
    const library = yield* Library;
    const jobs = yield* JobQueue;
    if (!paletteBackfillDone) {
      const next = yield* library.nextImagePaletteCandidate(paletteCursor);
      if (next) {
        yield* jobs.enqueue(next.id, IMAGE_PALETTE_JOB);
        paletteCursor = next.rowid;
        return;
      }
      paletteBackfillDone = true;
    }
    if (!posterBackfillDone) {
      const next = yield* library.nextVideoPosterCandidate(posterCursor);
      if (next) {
        yield* jobs.enqueue(next.id, VIDEO_POSTER_JOB);
        posterCursor = next.rowid;
        return;
      }
      posterBackfillDone = true;
    }
    if (searchModels) {
      const next = yield* library.nextSearchCandidate();
      if (next) {
        yield* jobs.enqueue(next.id, "generate_embedding");
        return;
      }
      const caption = yield* library.nextCaptionCandidate();
      if (caption) {
        yield* jobs.enqueue(caption.id, "caption_image");
        return;
      }
    }
    if (thumbnailBackfillDone) return;
    const next = yield* library.nextPdfThumbnailCandidate(thumbnailCursor);
    if (!next) {
      thumbnailBackfillDone = true;
      return;
    }
    yield* jobs.enqueue(next.id, PDF_THUMBNAIL_JOB);
    thumbnailCursor = next.rowid;
  });

  return {
    processors,
    thumbnailProcessors,
    onIdle,
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
