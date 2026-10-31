import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { sharpImageInput } from "./thumbnail.ts";

const tesseractEntry = fileURLToPath(import.meta.resolve("tesseract.js"));
const tesseractDirectory = dirname(tesseractEntry);
const languageDirectory = dirname(fileURLToPath(import.meta.resolve("@tesseract.js-data/eng")));
function localPackagePath(path: string) {
  if (!process.versions.electron || !process.resourcesPath) return path;
  return path.replace(/app\.asar(?=$|[/\\])/, "app.asar.unpacked");
}

type OcrWorker = {
  setParameters(parameters: Record<string, string>): Promise<unknown>;
  recognize(image: Buffer): Promise<{ data: { text?: string; confidence: number } }>;
  terminate(): Promise<unknown>;
};
type OcrWorkerFactory = (
  language: string,
  oem: number,
  options: Record<string, unknown>,
) => Promise<OcrWorker>;

export function createTesseractOcr({
  cacheDirectory,
  workerFactory = createWorker,
  shutdownGraceMillis = 2000,
}: {
  cacheDirectory: string;
  workerFactory?: OcrWorkerFactory;
  shutdownGraceMillis?: number;
}) {
  const cachePath = resolve(cacheDirectory);
  const workers: (Promise<OcrWorker> | undefined)[] = [];
  const pending = new Set<(error: Error) => void>();
  let serial: Promise<unknown> = Promise.resolve();
  let closed = false;
  let aborted = false;
  let closing: Promise<void> | undefined;
  const cancellation = () => new Error("OCR closed before recognition completed");

  function worker(slot: number): Promise<OcrWorker> {
    if (aborted) return Promise.reject(cancellation());
    workers[slot] ??= (async () => {
      // A second lazy worker is used only for difficult-image deskew passes.
      // Separate cache files avoid concurrent language-cache publication.
      const directory = slot === 0 ? cachePath : join(cachePath, `lane-${slot}`);
      await mkdir(directory, { recursive: true });
      if (aborted) throw cancellation();
      return workerFactory("eng", 1, {
        cachePath: directory,
        cacheMethod: "write",
        gzip: true,
        langPath: localPackagePath(join(languageDirectory, "4.0.0_best_int")),
        workerPath: localPackagePath(join(tesseractDirectory, "worker-script/node/index.js")),
      });
    })().catch((error) => {
      workers[slot] = undefined;
      throw error;
    });
    return workers[slot];
  }

  async function recognizeImage(input: Buffer) {
    // Decoded before the worker: tesseract.js can otherwise emit an uncaught
    // main-process exception for corrupt bytes.
    const image = await sharp(await sharpImageInput(input))
      .png()
      .toBuffer();
    let bestText = "";
    let bestQuality = -1;
    let bestWordCount = 0;
    let bestConfidence = -1;
    function consider(result: { data: { text?: string; confidence: number } }) {
      const text = result.data.text?.trim() ?? "";
      const wordCount = text ? text.split(/\s+/).length : 0;
      const quality = wordCount ? result.data.confidence * Math.log2(wordCount + 1) : -1;
      if (quality > bestQuality) {
        bestQuality = quality;
        bestText = text;
        bestWordCount = wordCount;
        bestConfidence = result.data.confidence;
      }
    }
    async function run(bytes: Buffer, psm: number, slot = 0) {
      const current = await worker(slot);
      if (aborted) throw cancellation();
      await current.setParameters({ tessedit_pageseg_mode: String(psm) });
      if (aborted) throw cancellation();
      return current.recognize(bytes);
    }
    // Preserve all three page modes and the original confidence/word-count
    // decisions; this optimization never skips OCR on an assumed textless image.
    for (const psm of [3, 6, 7]) consider(await run(image, psm));
    if (bestWordCount === 0 || bestConfidence < 70) {
      const highContrast = await sharp(image).grayscale().threshold(225).png().toBuffer();
      consider(await run(highContrast, 6));
    }
    if (bestWordCount < 8 || bestConfidence < 70) {
      const angles = [-15, -10, -5, 5, 10, 15];
      for (let offset = 0; offset < angles.length; offset += 2) {
        // At most two decoded rotations and two worker calls live at once.
        // allSettled drains the sibling before failure releases serial admission.
        const results = await Promise.allSettled(
          angles.slice(offset, offset + 2).map(async (angle, slot) => {
            const rotated = await sharp(image)
              .rotate(angle, { background: "#ffffff" })
              .png()
              .toBuffer();
            return run(rotated, 6, slot);
          }),
        );
        for (const result of results) {
          if (result.status === "rejected") throw result.reason;
          consider(result.value);
        }
      }
    }
    return bestText;
  }

  function recognize(input: Buffer) {
    if (closed) return Promise.reject(new Error("OCR is closed"));
    const work = serial.then(() => {
      if (aborted) throw cancellation();
      return recognizeImage(input);
    });
    // A terminated Tesseract worker need not settle its recognize promise. The
    // public result is cancellable independently, including already queued files.
    const result = new Promise<string>((resolve, reject) => {
      pending.add(reject);
      work.then(
        (text) => {
          pending.delete(reject);
          resolve(text);
        },
        (error) => {
          pending.delete(reject);
          reject(error);
        },
      );
    });
    serial = result.catch(() => {});
    return result;
  }
  function close() {
    closed = true;
    closing ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          serial,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, Math.min(2000, Math.max(0, shutdownGraceMillis)));
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      aborted = true;
      for (const reject of pending) reject(cancellation());
      pending.clear();
      const terminations = Promise.allSettled(
        workers.splice(0).map(async (worker) => (await worker)?.terminate()),
      );
      try {
        const results = await Promise.race([
          terminations,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("OCR worker shutdown timed out")), 2000);
          }),
        ]);
        const failed = results.find((result) => result.status === "rejected");
        if (failed?.status === "rejected") throw failed.reason;
      } finally {
        clearTimeout(timer);
      }
    })();
    return closing;
  }
  return { recognize, close };
}
