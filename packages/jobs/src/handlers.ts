import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type PdfEvent, WorkerError, WorkerRpcs } from "@inkling/contracts/jobs";
import type { NormalizedArticle } from "@inkling/ingestion/types";
import { Effect, Queue, Stream } from "effect";
import { createEmbeddingEngine } from "./embeddings.ts";
import { createTesseractOcr } from "./ocr.ts";
import type { extractPdfTextByPages } from "./pdf.ts";
import { createVideoPoster, type ShellThumbnail } from "./video-poster.ts";

export type Ocr = {
  recognize: (image: Buffer) => Promise<string>;
  close?: () => unknown;
};
export type Embeddings = Pick<
  ReturnType<typeof createEmbeddingEngine>,
  "embedText" | "embedQuery" | "embedImage"
>;

export type WorkerOptions = {
  modelCacheDirectory: string;
  bundledModelDirectory?: string;
  ocr?: Ocr;
  embeddings?: Embeddings;
  extractPdf?: typeof extractPdfTextByPages;
  extractUrl?: (url: string) => Promise<NormalizedArticle>;
  shell?: ShellThumbnail;
  videoDecoderPath?: string | null;
};

const failure = (cause: unknown) =>
  new WorkerError({ message: cause instanceof Error ? cause.message : String(cause) });
const attempt = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: failure });
const read = (path: string) => attempt(() => readFile(path));

// pdf.js and the canvas package load on first use: the canvas entry scans every
// system font, which costs seconds and crashes under Electron's Linux fontconfig.
const thumbnails = () => import("./thumbnail.ts");
const pdf = () => import("./pdf.ts");

async function cardThumbnail(image: Buffer) {
  const { bytes, width, height } = await (await thumbnails()).createImageThumbnail(image);
  return { bytes, width: width ?? null, height: height ?? null };
}

const vector = (embedding: { model: string; bytes: Buffer; vector: Float32Array }) => ({
  model: embedding.model,
  bytes: embedding.bytes,
  dimension: embedding.vector.length,
});

/** The worker's calls as plain functions; the RPC layer and tests share them. */
export const makeWorkerHandlers = Effect.fnUntraced(function* ({
  modelCacheDirectory,
  bundledModelDirectory,
  ocr = createTesseractOcr({ cacheDirectory: join(modelCacheDirectory, "tesseract") }),
  embeddings = createEmbeddingEngine(modelCacheDirectory, bundledModelDirectory),
  extractPdf,
  extractUrl = (url) => import("@inkling/ingestion").then(({ ingestUrl }) => ingestUrl(url)),
  shell,
  videoDecoderPath,
}: WorkerOptions) {
  yield* Effect.addFinalizer(() => Effect.promise(async () => ocr.close?.()).pipe(Effect.ignore));

  return WorkerRpcs.of({
    recognizeImage: ({ path }) =>
      read(path).pipe(
        Effect.flatMap((image) => attempt(() => ocr.recognize(image))),
        Effect.map((text) => text.trim()),
      ),

    readPdf: ({ path, firstPageThumbnail }) =>
      Stream.callback<PdfEvent, WorkerError>((queue) =>
        Effect.gen(function* () {
          const bytes = yield* read(path);
          const extract = extractPdf ?? (yield* attempt(pdf)).extractPdfTextByPages;
          const result = yield* attempt(() =>
            extract(bytes, {
              recognize: (image) => ocr.recognize(image),
              onFirstPageThumbnail: firstPageThumbnail
                ? async (png) => {
                    const thumbnail = await cardThumbnail(png);
                    Queue.offerUnsafe(queue, { _tag: "FirstPage", thumbnail });
                  }
                : undefined,
              onProgress: (current, total, message) =>
                Queue.offerUnsafe(queue, { _tag: "Progress", current, total, message }),
            }),
          );
          const { text, engine, pages } = result;
          Queue.offerUnsafe(queue, { _tag: "Text", text, engine, pageCount: pages.length });
          yield* Queue.end(queue);
        }),
      ),

    pdfThumbnail: ({ path }) =>
      read(path).pipe(
        Effect.flatMap((bytes) =>
          attempt(async () => cardThumbnail(await (await pdf()).renderPdfFirstPage(bytes))),
        ),
      ),

    imageThumbnail: ({ path }) =>
      read(path).pipe(Effect.flatMap((image) => attempt(() => cardThumbnail(image)))),

    imagePalette: ({ path }) =>
      read(path).pipe(
        Effect.flatMap((image) =>
          attempt(async () => (await thumbnails()).dominantImageColors(image)),
        ),
      ),

    videoPoster: ({ path }) =>
      attempt(() => createVideoPoster(path, { shell, decoderPath: videoDecoderPath })).pipe(
        Effect.flatMap((png) => (png ? attempt(() => cardThumbnail(png)) : Effect.succeed(null))),
      ),

    embedText: ({ text }) => attempt(() => embeddings.embedText(text)).pipe(Effect.map(vector)),

    embedImage: ({ path }) =>
      read(path).pipe(
        Effect.flatMap((image) => attempt(() => embeddings.embedImage(image))),
        Effect.map(vector),
      ),

    embedQuery: ({ text }) =>
      attempt(() => embeddings.embedQuery(text)).pipe(
        Effect.map(({ vector }) => Array.from(vector)),
      ),

    extractUrl: ({ url }) => attempt(() => extractUrl(url)),
  });
});

export const workerHandlersLayer = (options: WorkerOptions) =>
  WorkerRpcs.toLayer(makeWorkerHandlers(options));
