import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiJobProcessors, embeddingText, enqueueStaleImageEmbeddings } from "./ai-jobs.mjs";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.mjs";
import { JobWorker, openLibraryStorage } from "./storage.mjs";
import { createImageThumbnail } from "./thumbnail.mjs";

const roots: string[] = [];
const libraries: ReturnType<typeof openLibraryStorage>[] = [];

function temporaryLibrary() {
  const root = mkdtempSync(join(tmpdir(), "inkling-electron-ai-"));
  roots.push(root);
  const library = openLibraryStorage(join(root, "library.sqlite3"), {
    createThumbnail: createImageThumbnail,
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

afterEach(() => {
  for (const library of libraries.splice(0)) library.db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Electron jobs OCR captured files, index their text, and persist matching model vectors", async () => {
  const { root, library } = temporaryLibrary();
  const image = await library.saveFile({
    fileName: "image-columns-01.png",
    mimeType: "image/png",
    kind: "image",
    bytes: [...readFileSync("benchmarks/corpus/images/image-columns-01.png")],
  });
  const pdf = await library.saveFile({
    fileName: "pdf-native-text-01.pdf",
    mimeType: "application/pdf",
    kind: "pdf",
    bytes: [...readFileSync("benchmarks/corpus/pdfs/pdf-native-text-01.pdf")],
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

  const worker = new JobWorker(library, { processors: ai.processors, workerId: "ai-test" });
  await worker.pump();
  await worker.stop();

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
  await ai.close();
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
