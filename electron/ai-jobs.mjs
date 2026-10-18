import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createEmbeddingEngine } from "./embeddings.mjs";
import { IMAGE_MODEL } from "./embedding-contract.mjs";
import { createTesseractOcr } from "./ocr.mjs";
import { markdownToPlainText, PDF_THUMBNAIL_JOB } from "./storage.mjs";

async function itemAsset(storage, item) {
  if (!item?.localAssetPath) throw new Error("item has no local asset path");
  return readFile(await storage.resolveAssetPath(item.localAssetPath));
}

export function embeddingText(item) {
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

export function enqueueStaleImageEmbeddings(storage) {
  const items = storage.db
    .prepare(`SELECT e.item_id FROM item_embeddings e JOIN items i ON i.id = e.item_id
      WHERE e.kind = 'image' AND e.model != ? AND i.kind = 'image'`)
    .all(IMAGE_MODEL);
  for (const item of items)
    storage.jobs.enqueue(item.item_id, "generate_embedding", { notify: false });
  return items.length;
}

export function createAiJobProcessors({
  modelCacheDirectory,
  bundledModelDirectory,
  ocr = createTesseractOcr({ cacheDirectory: join(modelCacheDirectory, "tesseract") }),
  embeddings = createEmbeddingEngine(modelCacheDirectory, undefined, bundledModelDirectory),
  extractPdf,
} = {}) {
  let thumbnailCursor = 0;
  let thumbnailBackfillDone = false;

  const processors = {
    async ocr_image(job, storage, workerId) {
      const item = storage.getItem(job.itemId);
      if (!item) throw new Error("item not found");
      storage.jobs.updateProgress(job.id, workerId, 0, 1, "Reading image");
      const text = (await ocr.recognize(await itemAsset(storage, item))).trim();
      if (text) {
        storage.storeOcrText(item.id, text, "tesseract.js");
        storage.jobs.enqueue(item.id, "generate_embedding");
        storage.jobs.updateProgress(job.id, workerId, 1, 1, "Image text indexed");
      } else {
        storage.jobs.updateProgress(job.id, workerId, 1, 1, "No text found");
      }
    },

    async ocr_pdf_page(job, storage, workerId) {
      const item = storage.getItem(job.itemId);
      if (!item) throw new Error("item not found");
      let result;
      try {
        const pdfBytes = await itemAsset(storage, item);
        const extract = extractPdf ?? (await import("./pdf.mjs")).extractPdfTextByPages;
        result = await extract(pdfBytes, {
          recognize: (image) => ocr.recognize(image),
          onFirstPageThumbnail: item.thumbnailPath
            ? undefined
            : (png) => storage.storePdfThumbnail(item.id, png),
          onProgress: (current, total, message) =>
            storage.jobs.updateProgress(job.id, workerId, current, total, message),
        });
      } finally {
        if (!storage.getItem(item.id)?.thumbnailPath) {
          thumbnailCursor = 0;
          thumbnailBackfillDone = false;
        }
      }
      const pageCount = result.pages.length;
      if (result.text) {
        storage.storeOcrText(item.id, result.text, result.engine);
        storage.jobs.enqueue(item.id, "generate_embedding");
        storage.jobs.updateProgress(job.id, workerId, pageCount, pageCount, "PDF text indexed");
      } else {
        storage.jobs.updateProgress(job.id, workerId, pageCount, pageCount, "No text found");
      }
    },

    async [PDF_THUMBNAIL_JOB](job, storage) {
      const item = storage.getItem(job.itemId);
      if (!item) throw new Error("item not found");
      const pdfBytes = await itemAsset(storage, item);
      const { renderPdfFirstPage } = await import("./pdf.mjs");
      await storage.storePdfThumbnail(item.id, await renderPdfFirstPage(pdfBytes));
    },

    async generate_embedding(job, storage, workerId) {
      const item = storage.getItem(job.itemId);
      if (!item) throw new Error("item not found");
      const text = embeddingText(item);
      const total = Number(Boolean(text)) + Number(item.kind === "image");
      storage.jobs.updateProgress(
        job.id,
        workerId,
        0,
        total,
        "Loading local Nomic embedding models",
      );
      let current = 0;

      if (text) {
        const embedding = await embeddings.embedText(text);
        storage.storeEmbedding(
          item.id,
          "text",
          embedding.model,
          embedding.bytes,
          embedding.vector.length,
        );
        current += 1;
        storage.jobs.updateProgress(job.id, workerId, current, total, "Text search index ready");
      }

      if (item.kind === "image") {
        const embedding = await embeddings.embedImage(await itemAsset(storage, item));
        storage.storeEmbedding(
          item.id,
          "image",
          embedding.model,
          embedding.bytes,
          embedding.vector.length,
        );
        storage.jobs.updateProgress(
          job.id,
          workerId,
          current + 1,
          total,
          "Image similarity index ready",
        );
      }
    },
  };

  return {
    processors,
    onIdle(storage) {
      if (thumbnailBackfillDone) return;
      const next = storage.nextPdfThumbnailCandidate(thumbnailCursor);
      if (!next) {
        thumbnailBackfillDone = true;
        return;
      }
      storage.jobs.enqueue(next.id, PDF_THUMBNAIL_JOB, { notify: false });
      thumbnailCursor = next.rowid;
    },
    embedQuery: async (text) => (await embeddings.embedQuery(text)).vector,
    close: () => ocr.close?.(),
  };
}
