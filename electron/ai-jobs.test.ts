import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { enqueueStaleImageEmbeddings } from "./embedding-jobs.ts";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import { URL_ENRICHMENT_JOB } from "./storage/library.ts";
import {
  cleanUpJobTests,
  closeProcessors,
  createAiJobProcessors,
  embedding,
  pdfFixture,
  savePdf,
  temporaryLibrary,
  unusedModels,
} from "./test-jobs.ts";
import { createImageThumbnail } from "./thumbnail.ts";

cleanUpJobTests();

test("Electron jobs OCR captured files, index their text, and persist matching model vectors", async () => {
  const { root, library } = await temporaryLibrary();
  const image = await library.saveFile({
    fileName: "image-columns-01.png",
    mimeType: "image/png",
    kind: "image",
    bytes: readFileSync("benchmarks/corpus/images/image-columns-01.png"),
  });
  const pdf = await library.saveFile({
    fileName: "pdf-native-text-01.pdf",
    mimeType: "application/pdf",
    kind: "pdf",
    bytes: readFileSync("benchmarks/corpus/pdfs/pdf-native-text-01.pdf"),
  });
  if (!image || !pdf) throw new Error("files were not saved");
  await library.storeEmbedding(image.id, "image", "nomic-embed-vision-v1.5", Buffer.alloc(8), 2);
  expect(await library.run(enqueueStaleImageEmbeddings)).toBe(1);
  const ocrInputs: Buffer[] = [];
  const embeddedTexts: string[] = [];
  const embeddedQueries: string[] = [];
  let closed = false;
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ocr: {
      recognize: async (bytes) => {
        ocrInputs.push(Buffer.from(bytes));
        return "Field notes from the local library";
      },
      close: async () => {
        closed = true;
      },
    },
    embeddings: {
      embedText: async (text) => {
        embeddedTexts.push(text);
        return embedding(TEXT_MODEL);
      },
      embedQuery: async (text) => {
        embeddedQueries.push(text);
        return embedding(TEXT_MODEL);
      },
      embedImage: async () => embedding(IMAGE_MODEL),
    },
    extractPdf: async (_bytes, options) => {
      const onProgress = options?.onProgress;
      onProgress?.(0, 3, "OCR page 1 of 3");
      const text = (await options?.recognize?.(Buffer.from("rendered PDF page"))) ?? "";
      onProgress?.(1, 3, "Reading PDF text");
      onProgress?.(2, 3, "Reading PDF text");
      onProgress?.(3, 3, "Reading PDF text");
      return {
        pages: [text, "Second page", "Third page"],
        text: `${text}\n\nNative PDF text`,
        engine: "pdf-text+tesseract.js",
        ocrPages: 1,
      };
    },
  });
  library.db
    .prepare(`UPDATE jobs SET created_at = CASE kind
    WHEN 'ocr_image' THEN 1 WHEN 'ocr_pdf_page' THEN 2 ELSE 3 END`)
    .run();

  await (await library.worker({ processors: ai.processors, workerId: "ai-test" })).drain();

  expect((await library.getItem(image.id))?.ocrText).toBe("Field notes from the local library");
  expect((await library.getItem(image.id))?.metadata.ocrEngine).toBe("tesseract.js");
  expect((await library.getItem(pdf.id))?.ocrText).toBe(
    "Field notes from the local library\n\nNative PDF text",
  );
  expect((await library.getItem(pdf.id))?.metadata.ocrEngine).toBe("pdf-text+tesseract.js");
  expect((await library.searchItems("library")).map((item) => item.id).sort()).toEqual(
    [pdf.id, image.id].sort(),
  );
  expect(ocrInputs).toHaveLength(2);
  expect(embeddedTexts).toHaveLength(2);
  expect(embeddedTexts.every((text) => text.includes("Field notes from the local library"))).toBe(
    true,
  );
  expect(await ai.embedQuery("quiet telescope")).toEqual(Float32Array.from([1, 0]));
  expect(embeddedQueries).toEqual(["quiet telescope"]);

  const vectors = library.db
    .prepare("SELECT item_id, kind, model FROM item_embeddings ORDER BY item_id, kind")
    .all();
  expect(vectors).toHaveLength(3);
  expect(vectors).toContainEqual({ item_id: image.id, kind: "image", model: IMAGE_MODEL });
  expect(vectors).toContainEqual({ item_id: image.id, kind: "text", model: TEXT_MODEL });
  expect(vectors).toContainEqual({ item_id: pdf.id, kind: "text", model: TEXT_MODEL });
  expect(
    (await library.jobs.getForItems([image.id, pdf.id])).every((job) => job.status === "completed"),
  ).toBe(true);
  expect(
    library.db
      .prepare(
        "SELECT progress_current, progress_total FROM jobs WHERE item_id = ? AND kind = 'ocr_pdf_page'",
      )
      .get(pdf.id),
  ).toEqual({ progress_current: 3, progress_total: 3 });
  await closeProcessors(ai);
  expect(closed).toBe(true);
});

test("URL enrichment updates the captured item before its text is embedded", async () => {
  const { root, library } = await temporaryLibrary();
  const captured = await library.captureUrl({
    sourceUrl: "https://example.com/requested-path",
    captureSource: "quick link",
  });
  if (!captured) throw new Error("URL was not captured");
  const embeddedTexts: string[] = [];
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    embeddings: {
      ...unusedModels.embeddings,
      embedText: async (text) => {
        embeddedTexts.push(text);
        return embedding(TEXT_MODEL);
      },
    },
    extractUrl: async (sourceUrl) => {
      expect(sourceUrl).toBe("https://example.com/requested-path");
      return {
        canonicalUrl: "https://example.com/canonical-path",
        title: "Extracted article title",
        description: "Extracted article summary.",
        text: "Article text searchable later.",
        html: "<article><p>Article text searchable later.</p></article>",
        author: "Local author",
        publishedDate: "2026-10-18",
        imageUrls: [],
        imageDimensions: [],
        safeEmbeds: [],
        extractor: "defuddle",
      };
    },
  });

  await (await library.worker({ processors: ai.processors, workerId: "url-capture-test" })).drain();

  expect(await library.getItem(captured.id)).toMatchObject({
    id: captured.id,
    title: "Extracted article title",
    description: "Extracted article summary.",
    sourceUrl: "https://example.com/canonical-path",
    metadata: {
      captureSource: "quick link",
      sourceUrl: "https://example.com/canonical-path",
      text: "Article text searchable later.",
      extractedText: "Article text searchable later.",
      html: "<article><p>Article text searchable later.</p></article>",
      author: "Local author",
      publishedDate: "2026-10-18",
    },
  });
  expect(embeddedTexts).toHaveLength(1);
  expect(embeddedTexts[0]).toContain("Article text searchable later.");
  expect(
    (await library.jobs.getForItem(captured.id))
      .map(({ kind, status }) => `${kind}:${status}`)
      .sort(),
  ).toEqual([`${URL_ENRICHMENT_JOB}:completed`, "generate_embedding:completed"].sort());
  await closeProcessors(ai);
});

test("failed URL enrichment retries while keeping the fallback item available", async () => {
  const { root, library } = await temporaryLibrary();
  const captured = await library.captureUrl({
    sourceUrl: "https://example.com/requested-path",
    title: "Saved by extension",
    captureSource: "browser extension",
  });
  if (!captured) throw new Error("URL was not captured");
  let attempts = 0;
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    extractUrl: async () => {
      attempts += 1;
      throw new Error("site is temporarily unavailable");
    },
  });

  await (await library.worker({ processors: ai.processors, workerId: "url-failure-test" })).drain();

  expect(attempts).toBe(4);
  expect(await library.getItem(captured.id)).toMatchObject({
    id: captured.id,
    title: "Saved by extension",
    sourceUrl: "https://example.com/requested-path",
    sourceLabel: "example.com",
    metadata: { captureSource: "browser extension" },
  });
  const [job] = await library.jobs.getForItem(captured.id);
  expect(job).toMatchObject({
    kind: URL_ENRICHMENT_JOB,
    status: "failed",
    retryCount: 3,
    errorMessage: "site is temporarily unavailable",
  });
  expect(await library.jobs.retry(job.id)).toBe(true);
  expect((await library.jobs.getForItem(captured.id))[0]).toMatchObject({
    status: "pending",
    retryCount: 0,
  });
  await closeProcessors(ai);
});

test("PDF capture stays instant and the OCR job publishes the page-one thumbnail", async () => {
  let thumbnailCalls = 0;
  const { root, library } = await temporaryLibrary({
    media: {
      createThumbnail: async (bytes) => {
        thumbnailCalls += 1;
        return createImageThumbnail(bytes);
      },
    },
  });
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  expect(pdf.thumbnailPath).toBeNull();
  expect(thumbnailCalls).toBe(0);
  const itemDirectory = join(root, "assets", "items", pdf.id);
  expect(readdirSync(itemDirectory)).toEqual(["native.pdf"]);

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  await (await library.worker({ processors: ai.processors, workerId: "capture-test" })).drain();

  const after = await library.getItem(pdf.id);
  expect(thumbnailCalls).toBe(1);
  expect(after?.thumbnailPath).toBe(`assets/items/${pdf.id}/thumbnail.webp`);
  expect(after?.ocrText).toContain("Field Guide to Local First Software");
  const metadata = await sharp(readFileSync(join(itemDirectory, "thumbnail.webp"))).metadata();
  expect(metadata.format).toBe("webp");
  expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(512);
  expect(readdirSync(root).filter((name) => name.startsWith(".inkling-thumbnail-"))).toEqual([]);
  expect((await library.jobs.getForItem(pdf.id)).map((job) => job.kind).sort()).toEqual([
    "generate_embedding",
    "ocr_pdf_page",
  ]);
  await closeProcessors(ai);
});
