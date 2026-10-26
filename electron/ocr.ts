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
}: {
  cacheDirectory: string;
  workerFactory?: OcrWorkerFactory;
}) {
  const cachePath = resolve(cacheDirectory);
  let workerPromise: Promise<OcrWorker> | null | undefined;

  async function worker(): Promise<OcrWorker> {
    workerPromise ??= (async () => {
      await mkdir(cachePath, { recursive: true });
      return workerFactory("eng", 1, {
        cachePath,
        cacheMethod: "write",
        gzip: true,
        langPath: localPackagePath(join(languageDirectory, "4.0.0_best_int")),
        workerPath: localPackagePath(join(tesseractDirectory, "worker-script/node/index.js")),
      });
    })().catch((error) => {
      workerPromise = undefined;
      throw error;
    });
    return workerPromise;
  }

  async function recognize(input: Buffer) {
    // Decoded here first: tesseract.js throws a corrupt image from its worker
    // as an uncaught main-process exception, while sharp rejects it cleanly.
    const image = await sharp(await sharpImageInput(input))
      .png()
      .toBuffer();
    const current = await worker();
    let bestText = "";
    let bestQuality = -1;
    let bestWordCount = 0;
    let bestConfidence = -1;

    async function recognizeWithMode(input: Buffer, psm: number) {
      await current.setParameters({ tessedit_pageseg_mode: String(psm) });
      const result = await current.recognize(input);
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

    for (const psm of [3, 6, 7]) await recognizeWithMode(image, psm);
    if (bestWordCount === 0 || bestConfidence < 70) {
      const highContrast = await sharp(image).grayscale().threshold(225).png().toBuffer();
      await recognizeWithMode(highContrast, 6);
    }
    if (bestWordCount < 8 || bestConfidence < 70) {
      for (const angle of [-15, -10, -5, 5, 10, 15]) {
        const rotated = await sharp(image)
          .rotate(angle, { background: "#ffffff" })
          .png()
          .toBuffer();
        await recognizeWithMode(rotated, 6);
      }
    }
    return bestText;
  }

  async function close() {
    if (workerPromise) {
      const current = await workerPromise;
      workerPromise = null;
      await current.terminate();
    }
  }

  return { recognize, close };
}
