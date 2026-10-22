import { afterAll, afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  createAiJobProcessors as createProcessors,
  embeddingText,
  enqueueStaleImageEmbeddings,
} from "./ai-jobs.mjs";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.mjs";
import { extractPdfTextByPages } from "./pdf.mjs";
import {
  JOB_LEASE_MILLIS,
  JobWorker,
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  openLibraryStorage,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
} from "./storage.mjs";
import { createImageThumbnail, inspectImage } from "./thumbnail.mjs";

const roots: string[] = [];
const libraries: ReturnType<typeof openLibraryStorage>[] = [];
const workers = new Set<JobWorker>();
const processors = new Set<ReturnType<typeof createProcessors>>();

function createAiJobProcessors(options: Parameters<typeof createProcessors>[0]) {
  const ai = createProcessors(options);
  processors.add(ai);
  return ai;
}

function createWorker(
  library: ReturnType<typeof openLibraryStorage>,
  options: ConstructorParameters<typeof JobWorker>[1],
) {
  const worker = new JobWorker(library, options);
  workers.add(worker);
  return worker;
}

async function stopWorker(worker: JobWorker) {
  workers.delete(worker);
  await worker.stop();
}

async function closeProcessors(ai: ReturnType<typeof createProcessors>) {
  processors.delete(ai);
  await ai.close();
}

function temporaryLibrary(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-ai-"));
  roots.push(root);
  const library = openLibraryStorage(join(root, "library.sqlite3"), {
    createThumbnail: createImageThumbnail,
    inspectImage,
    ...options,
  });
  libraries.push(library);
  return { root, library };
}

function embedding(model: string) {
  const vector = Float32Array.from([1, 0]);
  const bytes = Buffer.alloc(8);
  bytes.writeFloatLE(1, 0);
  return { model, vector, bytes };
}

afterEach(async () => {
  for (const worker of workers) await stopWorker(worker);
  workers.clear();
  for (const ai of processors) await closeProcessors(ai);
  processors.clear();
  for (const library of libraries.splice(0)) library.db.close();
  Bun.gc(true);
});

afterAll(() => {
  Bun.gc(true);
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Electron jobs OCR captured files, index their text, and persist matching model vectors", async () => {
  const { root, library } = temporaryLibrary();
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
  library.storeEmbedding(image.id, "image", "nomic-embed-vision-v1.5", Buffer.alloc(8), 2);
  expect(enqueueStaleImageEmbeddings(library)).toBe(1);
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
    extractPdf: async (_bytes, { recognize, onProgress }) => {
      onProgress(0, 3, "OCR page 1 of 3");
      const text = await recognize(Buffer.from("rendered PDF page"));
      onProgress(1, 3, "Reading PDF text");
      onProgress(2, 3, "Reading PDF text");
      onProgress(3, 3, "Reading PDF text");
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

  const worker = createWorker(library, { processors: ai.processors, workerId: "ai-test" });
  await worker.pump();
  await stopWorker(worker);

  expect(library.getItem(image.id)?.ocrText).toBe("Field notes from the local library");
  expect(library.getItem(image.id)?.metadata.ocrEngine).toBe("tesseract.js");
  expect(library.getItem(pdf.id)?.ocrText).toBe(
    "Field notes from the local library\n\nNative PDF text",
  );
  expect(library.getItem(pdf.id)?.metadata.ocrEngine).toBe("pdf-text+tesseract.js");
  expect(
    library
      .searchItems("library")
      .map((item) => item.id)
      .sort(),
  ).toEqual([pdf.id, image.id].sort());
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
    library.jobs.getForItems([image.id, pdf.id]).every((job) => job.status === "completed"),
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

test("embedding text keeps the shared document inputs and markdown projection", () => {
  expect(
    embeddingText({
      title: "Reading list",
      description: "ignored description",
      body: "## Nomic\n\nA **local** model.",
      bodyFormat: "md",
      ocrText: "Cover text",
      metadata: { text: "ignored metadata" },
    }),
  ).toBe("Reading list\n\nNomic A local model.\n\nCover text");
});

const pdfFixture = (name: string) => readFileSync(`benchmarks/corpus/pdfs/${name}.pdf`);

function savePdf(
  library: ReturnType<typeof openLibraryStorage>,
  fileName: string,
  bytes: Uint8Array,
) {
  return library.saveFile({ fileName, mimeType: "application/pdf", kind: "pdf", bytes });
}

const unusedModels = {
  ocr: { recognize: async () => "" },
  embeddings: {
    embedText: async () => embedding(TEXT_MODEL),
    embedQuery: async () => embedding(TEXT_MODEL),
    embedImage: async () => embedding(IMAGE_MODEL),
  },
};

test("URL enrichment updates the captured item before its text is embedded", async () => {
  const { root, library } = temporaryLibrary();
  const captured = library.captureUrl({
    sourceUrl: "https://example.com/requested-path",
    captureSource: "quick link",
  });
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
  const worker = createWorker(library, {
    processors: ai.processors,
    workerId: "url-capture-test",
  });

  await worker.pump();
  await stopWorker(worker);

  expect(library.getItem(captured.id)).toMatchObject({
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
    library.jobs
      .getForItem(captured.id)
      .map(({ kind, status }) => `${kind}:${status}`)
      .sort(),
  ).toEqual([`${URL_ENRICHMENT_JOB}:completed`, "generate_embedding:completed"].sort());
  await closeProcessors(ai);
});

test("failed URL enrichment retries while keeping the fallback item available", async () => {
  const { root, library } = temporaryLibrary();
  const captured = library.captureUrl({
    sourceUrl: "https://example.com/requested-path",
    title: "Saved by extension",
    captureSource: "browser extension",
  });
  let attempts = 0;
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    extractUrl: async () => {
      attempts += 1;
      throw new Error("site is temporarily unavailable");
    },
  });
  const worker = createWorker(library, {
    processors: ai.processors,
    workerId: "url-failure-test",
  });

  await worker.pump();
  await stopWorker(worker);

  expect(attempts).toBe(4);
  expect(library.getItem(captured.id)).toMatchObject({
    id: captured.id,
    title: "Saved by extension",
    sourceUrl: "https://example.com/requested-path",
    sourceLabel: "example.com",
    metadata: { captureSource: "browser extension" },
  });
  expect(library.jobs.getForItem(captured.id)).toMatchObject([
    {
      kind: URL_ENRICHMENT_JOB,
      status: "failed",
      retryCount: 3,
      errorMessage: "site is temporarily unavailable",
    },
  ]);
  expect(library.jobs.retry(library.jobs.getForItem(captured.id)[0].id)).toBe(true);
  expect(library.jobs.getForItem(captured.id)[0]).toMatchObject({
    status: "pending",
    retryCount: 0,
  });
  await closeProcessors(ai);
});

test("PDF capture stays instant and the OCR job publishes the page-one thumbnail", async () => {
  let thumbnailCalls = 0;
  const { root, library } = temporaryLibrary({
    createThumbnail: async (bytes: Buffer) => {
      thumbnailCalls += 1;
      return createImageThumbnail(bytes);
    },
  });
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  expect(pdf.thumbnailPath).toBeNull();
  expect(thumbnailCalls).toBe(0);
  const itemDirectory = join(root, "assets", "items", pdf.id);
  expect(readdirSync(itemDirectory)).toEqual(["native.pdf"]);

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const worker = createWorker(library, { processors: ai.processors, workerId: "capture-test" });
  await worker.pump();
  await stopWorker(worker);

  const after = library.getItem(pdf.id);
  expect(thumbnailCalls).toBe(1);
  expect(after?.thumbnailPath).toBe(`assets/items/${pdf.id}/thumbnail.webp`);
  expect(after?.ocrText).toContain("Field Guide to Local First Software");
  const metadata = await sharp(readFileSync(join(itemDirectory, "thumbnail.webp"))).metadata();
  expect(metadata.format).toBe("webp");
  expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(512);
  expect(readdirSync(root).filter((name) => name.startsWith(".inkling-thumbnail-"))).toEqual([]);
  expect(
    library.jobs
      .getForItem(pdf.id)
      .map((job) => job.kind)
      .sort(),
  ).toEqual(["generate_embedding", "ocr_pdf_page"]);
  await closeProcessors(ai);
});

const imageFixture = () => readFileSync("benchmarks/corpus/images/image-columns-01.png");

function saveImage(library: ReturnType<typeof openLibraryStorage>, fileName = "photo.png") {
  return library.saveFile({
    fileName,
    mimeType: "image/png",
    kind: "image",
    bytes: imageFixture(),
  });
}

function thumbnailLane(
  library: ReturnType<typeof openLibraryStorage>,
  ai: ReturnType<typeof createProcessors>,
  options: Omit<NonNullable<ConstructorParameters<typeof JobWorker>[1]>, "processors"> = {},
) {
  return createWorker(library, { processors: ai.thumbnailProcessors, ...options });
}

test("image capture stays instant and the thumbnail job publishes the card image", async () => {
  const events: string[] = [];
  let thumbnailCalls = 0;
  const { root, library } = temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
    createThumbnail: async (bytes: Buffer) => {
      thumbnailCalls += 1;
      return createImageThumbnail(bytes);
    },
  });
  const image = await saveImage(library);
  const source = await sharp(imageFixture()).metadata();

  expect(thumbnailCalls).toBe(0);
  expect(image.thumbnailPath).toBeNull();
  expect(image.metadata).toMatchObject({ mediaWidth: source.width, mediaHeight: source.height });
  const itemDirectory = join(root, "assets", "items", image.id);
  expect(readdirSync(itemDirectory)).toEqual(["photo.png"]);
  events.length = 0;

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  await thumbnailLane(library, ai, { workerId: "thumbnail-test" }).pump();

  expect(thumbnailCalls).toBe(1);
  expect(library.getItem(image.id)?.thumbnailPath).toBe(`assets/items/${image.id}/thumbnail.webp`);
  const thumbnail = await sharp(readFileSync(join(itemDirectory, "thumbnail.webp"))).metadata();
  expect(thumbnail).toMatchObject({ format: "webp" });
  expect(Math.max(thumbnail.width ?? 0, thumbnail.height ?? 0)).toBeLessThanOrEqual(512);
  // The renderer hears about it through the same event as every other item update.
  expect(events).toEqual([image.id]);
  expect(library.jobs.getForItem(image.id).map((job) => job.kind)).not.toContain(
    IMAGE_THUMBNAIL_JOB,
  );
  await closeProcessors(ai);
});

test("the image palette job waits for the thumbnail job, then persists five dominant colors", async () => {
  const { root, library } = temporaryLibrary();
  const image = await saveImage(library, "palette.png");
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const paletteJobs = () =>
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(IMAGE_PALETTE_JOB);
  expect(paletteJobs()).toEqual([]);

  await thumbnailLane(library, ai).pump();
  expect(paletteJobs()).toEqual([{ status: "pending" }]);
  await ai.processors[IMAGE_PALETTE_JOB]({ itemId: image.id }, library);

  expect(library.getItem(image.id)?.palette).toHaveLength(5);
  expect(library.getItem(image.id)?.palette?.every((color) => /^#[0-9a-f]{6}$/i.test(color))).toBe(
    true,
  );
  await closeProcessors(ai);
});

test("a failed thumbnail keeps the item and the OCR and embedding work, with nothing to retry on screen", async () => {
  const { root, library } = temporaryLibrary({
    createThumbnail: async () => {
      throw new Error("image processing error: unable to decode image");
    },
  });
  const image = await saveImage(library, "corrupt.png");
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const worker = createWorker(library, { processors: ai.processors, workerId: "main-lane" });

  await thumbnailLane(library, ai).pump();
  await worker.pump();
  await stopWorker(worker);

  expect(library.getItem(image.id)).toMatchObject({ id: image.id, kind: "image" });
  expect(library.getItem(image.id)?.thumbnailPath).toBeNull();
  expect(
    library.db
      .prepare("SELECT status, retry_count FROM jobs WHERE kind = ?")
      .get(IMAGE_THUMBNAIL_JOB),
  ).toEqual({ status: "failed", retry_count: 3 });
  expect(
    library.db.prepare("SELECT 1 FROM jobs WHERE kind = ?").get(IMAGE_PALETTE_JOB),
  ).toBeUndefined();
  expect(library.jobs.getForItem(image.id).map((job) => job.status)).toEqual([
    "completed",
    "completed",
  ]);
  expect(library.jobs.countActive()).toBe(0);
  await closeProcessors(ai);
});

test("the thumbnail lane finishes while the main worker is held inside a long job", async () => {
  const { root, library } = temporaryLibrary();
  const image = await saveImage(library);
  let ocrStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    ocrStarted = resolve;
  });
  let finishOcr!: (text: string) => void;
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    ocr: {
      recognize: () =>
        new Promise<string>((resolve) => {
          finishOcr = resolve;
          ocrStarted();
        }),
    },
  });
  const main = createWorker(library, { processors: ai.processors, workerId: "main-lane" });
  const mainRun = main.pump();
  await started;

  await thumbnailLane(library, ai).pump();
  expect(library.getItem(image.id)?.thumbnailPath).toBe(`assets/items/${image.id}/thumbnail.webp`);

  finishOcr("");
  await mainRun;
  await stopWorker(main);
  await closeProcessors(ai);
});

test("a pending thumbnail job survives closing and reopening the library", async () => {
  const { root, library } = temporaryLibrary();
  const image = await saveImage(library);
  library.db.close();
  libraries.splice(libraries.indexOf(library), 1);

  const reopened = openLibraryStorage(join(root, "library.sqlite3"), {
    createThumbnail: createImageThumbnail,
  });
  libraries.push(reopened);
  expect(reopened.getItem(image.id)?.thumbnailPath).toBeNull();
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  await thumbnailLane(reopened, ai).start().stop();

  expect(reopened.getItem(image.id)?.thumbnailPath).toBe(`assets/items/${image.id}/thumbnail.webp`);
  await closeProcessors(ai);
});

test("a thumbnail job whose worker died resumes after its lease expires", async () => {
  let clock = 1_000_000;
  const { root, library } = temporaryLibrary({ jobQueue: { now: () => clock } });
  const image = await saveImage(library);
  const job = library.db.prepare("SELECT id FROM jobs WHERE kind = ?").get(IMAGE_THUMBNAIL_JOB);
  expect(library.jobs.claimNext("crashed-worker", [IMAGE_THUMBNAIL_JOB])?.id).toBe(job.id);
  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });

  // Still leased: a restart inside the lease must not run it twice.
  await thumbnailLane(library, ai).start().stop();
  expect(library.getItem(image.id)?.thumbnailPath).toBeNull();

  clock += JOB_LEASE_MILLIS + 1;
  await thumbnailLane(library, ai).start().stop();

  expect(library.getItem(image.id)?.thumbnailPath).toBe(`assets/items/${image.id}/thumbnail.webp`);
  expect(
    library.db.prepare("SELECT status FROM jobs WHERE kind = ?").all(IMAGE_THUMBNAIL_JOB),
  ).toEqual([{ status: "completed" }]);
  await closeProcessors(ai);
});

test("backfill drains one missing PDF thumbnail at a time, hides the work, and skips a broken PDF", async () => {
  const events: string[] = [];
  const { root, library } = temporaryLibrary({
    jobQueue: { onUpdated: (id: string) => events.push(id) },
  });
  const first = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  const broken = await savePdf(library, "broken.pdf", Buffer.from("not a pdf"));
  const second = await savePdf(library, "tables.pdf", pdfFixture("pdf-tables-01"));
  library.db.prepare("DELETE FROM jobs").run();
  events.length = 0;
  const captured = [first, second].map(({ id }) => library.getItem(id));

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const outstanding = () =>
    library.db
      .prepare(
        "SELECT COUNT(*) AS count FROM jobs WHERE kind = ? AND status IN ('pending', 'processing')",
      )
      .get(PDF_THUMBNAIL_JOB).count;
  const observed: number[] = [];
  const worker = createWorker(library, {
    processors: {
      [PDF_THUMBNAIL_JOB]: async (...args: Parameters<typeof ai.processors.pdf_thumbnail>) => {
        observed.push(outstanding());
        expect(library.jobs.countActive()).toBe(0);
        expect(library.jobs.getForItems([first.id, broken.id, second.id])).toEqual([]);
        await ai.processors.pdf_thumbnail(...args);
      },
    },
    onIdle: (storage: typeof library) => {
      ai.onIdle(storage);
      expect(outstanding()).toBeLessThanOrEqual(1);
    },
  });
  await worker.pump();
  await stopWorker(worker);

  expect(observed.every((count) => count === 1)).toBe(true);
  expect(observed).toHaveLength(6);
  expect(library.getItem(first.id)?.thumbnailPath).toBe(`assets/items/${first.id}/thumbnail.webp`);
  expect(library.getItem(second.id)?.thumbnailPath).toBe(
    `assets/items/${second.id}/thumbnail.webp`,
  );
  expect(library.getItem(broken.id)?.thumbnailPath).toBeNull();
  expect(
    library.db.prepare("SELECT status, retry_count FROM jobs WHERE item_id = ?").get(broken.id),
  ).toEqual({ status: "failed", retry_count: 3 });
  expect(events.sort()).toEqual([first.id, second.id].sort());
  for (const item of captured)
    expect(library.getItem(item?.id ?? "")).toEqual({
      ...item,
      thumbnailPath: `assets/items/${item?.id}/thumbnail.webp`,
    });
  expect(library.jobs.getForItem(broken.id)).toEqual([]);

  const jobRows = library.db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count;
  await worker.pump();
  ai.onIdle(library);
  expect(library.db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count).toBe(jobRows);
  expect(existsSync(join(root, "assets", "items", broken.id, "thumbnail.webp"))).toBe(false);
  await closeProcessors(ai);
});

test("a thumbnail job whose lease expired resumes on restart without duplicating work", async () => {
  let clock = 1_000_000;
  const events: string[] = [];
  const { root, library } = temporaryLibrary({
    jobQueue: { now: () => clock, onUpdated: (id: string) => events.push(id) },
  });
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();
  const jobId = library.jobs.enqueue(pdf.id, PDF_THUMBNAIL_JOB);
  expect(library.jobs.claimNext("crashed-worker")?.id).toBe(jobId);
  clock += JOB_LEASE_MILLIS + 1;
  events.length = 0;

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  let finished!: () => void;
  const done = new Promise<void>((resolve) => (finished = resolve));
  const worker = createWorker(library, {
    processors: {
      [PDF_THUMBNAIL_JOB]: async (...args: Parameters<typeof ai.processors.pdf_thumbnail>) => {
        await ai.processors.pdf_thumbnail(...args);
        finished();
      },
    },
    onIdle: ai.onIdle,
  }).start();
  await done;
  await stopWorker(worker);

  expect(library.getItem(pdf.id)?.thumbnailPath).toBe(`assets/items/${pdf.id}/thumbnail.webp`);
  expect(library.db.prepare("SELECT id, status FROM jobs").all()).toEqual([
    { id: jobId, status: "completed" },
  ]);
  expect(events).toEqual([pdf.id]);
  await closeProcessors(ai);
});

test("backfill stops scanning once exhausted and resumes only when PDF OCR leaves a page without a thumbnail", async () => {
  const { root, library } = temporaryLibrary();
  let renderDuringOcr = true;
  const ai = createAiJobProcessors({
    modelCacheDirectory: join(root, "models"),
    ...unusedModels,
    extractPdf: (bytes: Uint8Array, options: Parameters<typeof extractPdfTextByPages>[1]) =>
      extractPdfTextByPages(
        bytes,
        renderDuringOcr ? options : { ...options, onFirstPageThumbnail: undefined },
      ),
  });
  let scans = 0;
  const scan = library.nextPdfThumbnailCandidate.bind(library);
  library.nextPdfThumbnailCandidate = (cursor: number) => {
    scans += 1;
    return scan(cursor);
  };
  const worker = createWorker(library, { processors: ai.processors, onIdle: ai.onIdle });
  const jobKinds = (id: string) =>
    library.db
      .prepare("SELECT kind FROM jobs WHERE item_id = ? ORDER BY kind")
      .all(id)
      .map((row) => row.kind);

  const legacy = await savePdf(library, "legacy.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();
  await worker.pump();
  expect(library.getItem(legacy.id)?.thumbnailPath).not.toBeNull();
  const exhaustedScans = scans;
  await worker.pump();
  await worker.pump();
  expect(scans).toBe(exhaustedScans);

  const captured = await savePdf(library, "tables.pdf", pdfFixture("pdf-tables-01"));
  await worker.pump();
  expect(library.getItem(captured.id)?.thumbnailPath).not.toBeNull();
  expect(jobKinds(captured.id)).not.toContain(PDF_THUMBNAIL_JOB);
  expect(scans).toBe(exhaustedScans);

  renderDuringOcr = false;
  const unrendered = await savePdf(library, "columns.pdf", pdfFixture("pdf-multicolumn-01"));
  await worker.pump();
  expect(scans).toBeGreaterThan(exhaustedScans);
  expect(jobKinds(unrendered.id)).toContain(PDF_THUMBNAIL_JOB);
  expect(library.getItem(unrendered.id)?.thumbnailPath).toBe(
    `assets/items/${unrendered.id}/thumbnail.webp`,
  );
  await stopWorker(worker);
  await closeProcessors(ai);
});

test("backfill retries the same candidate after queue admission fails", async () => {
  const { root, library } = temporaryLibrary();
  const pdf = await savePdf(library, "native.pdf", pdfFixture("pdf-native-text-01"));
  library.db.prepare("DELETE FROM jobs").run();

  const ai = createAiJobProcessors({ modelCacheDirectory: join(root, "models"), ...unusedModels });
  const enqueue = library.jobs.enqueue.bind(library.jobs);
  let failAdmission = true;
  library.jobs.enqueue = (itemId: string, kind: string, options?: { notify?: boolean }) => {
    if (failAdmission) {
      failAdmission = false;
      throw new Error("temporary queue failure");
    }
    return enqueue(itemId, kind, options);
  };

  expect(() => ai.onIdle(library)).toThrow("temporary queue failure");
  ai.onIdle(library);

  expect(
    library.db.prepare("SELECT item_id, kind, status FROM jobs WHERE item_id = ?").get(pdf.id),
  ).toEqual({
    item_id: pdf.id,
    kind: PDF_THUMBNAIL_JOB,
    status: "pending",
  });
  await closeProcessors(ai);
});
