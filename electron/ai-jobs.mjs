import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createEmbeddingEngine } from "./embeddings.mjs";
import { createTesseractOcr } from "./ocr.mjs";
import { extractPdfTextByPages } from "./pdf.mjs";
import { markdownToPlainText } from "./storage.mjs";

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
  const parts = [item.title, description, description, item.ocrText]
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

export function createAiJobProcessors({
  modelCacheDirectory,
  ocr = createTesseractOcr({ cacheDirectory: join(modelCacheDirectory, "tesseract") }),
  embeddings = createEmbeddingEngine(modelCacheDirectory),
  extractPdf = extractPdfTextByPages,
} = {}) {
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
      const result = await extractPdf(await itemAsset(storage, item), {
        recognize: (image) => ocr.recognize(image),
        onProgress: (current, total, message) =>
          storage.jobs.updateProgress(job.id, workerId, current, total, message),
      });
      if (result.text) {
        storage.storeOcrText(item.id, result.text, result.engine);
        storage.jobs.enqueue(item.id, "generate_embedding");
        storage.jobs.updateProgress(job.id, workerId, 1, 1, "PDF text indexed");
      } else {
        storage.jobs.updateProgress(job.id, workerId, 1, 1, "No text found");
      }
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

  return { processors, close: () => ocr.close?.() };
}
