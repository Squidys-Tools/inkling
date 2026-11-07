import { mkdir } from "node:fs/promises";
import { availableParallelism, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import { maxImagePixels, sharpImageInput } from "./thumbnail.ts";

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

// Each Tesseract worker reads on one core, so a few of them read several images,
// and the rotations of one image, at once. Each can hold hundreds of
// megabytes: one per three cores and per 4 GB of memory, but at least two and at most four.
const defaultOcrWorkers = () =>
  Math.min(
    4,
    Math.max(2, Math.min(Math.floor(availableParallelism() / 3), Math.floor(totalmem() / 4e9))),
  );

// Larger images are read at this size. In our benchmark of real photos, reads at
// 12 MP and at full size found fewer words than 6 MP and took far longer.
const OCR_PIXELS = 6_000_000;
// A full-page screenshot shrunk to that size lost 98% of its words, so an image longer
// than 16:9 keeps the short edge a 16:9 image has at that size.
const MIN_OCR_EDGE = Math.sqrt((OCR_PIXELS * 9) / 16);
// Past this, every pass would hold gigabytes.
const MAX_OCR_PIXELS = 33_554_432;
// Tesseract's heap grows to the largest image a worker has read and never shrinks,
// so a pass over more than OCR_PIXELS runs alone and its worker is then replaced.
const LARGE_OCR_PASSES = 1;

export function createTesseractOcr({
  cacheDirectory,
  workerFactory = createWorker,
  shutdownGraceMillis = 2000,
  idleMillis = 30_000,
  workers: poolSize = defaultOcrWorkers(),
}: {
  cacheDirectory: string;
  workerFactory?: OcrWorkerFactory;
  shutdownGraceMillis?: number;
  idleMillis?: number;
  workers?: number;
}) {
  const cachePath = resolve(cacheDirectory);
  const workers: (Promise<OcrWorker> | undefined)[] = [];
  const idle: number[] = [];
  const waiting: ((slot: number) => void)[] = [];
  let started = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let largeActive = 0;
  const largeWaiting: (() => void)[] = [];
  const pending = new Set<(error: Error) => void>();
  const inFlight = new Set<Promise<unknown>>();
  let closed = false;
  let aborted = false;
  let closing: Promise<void> | undefined;
  const cancellation = () => new Error("OCR closed before recognition completed");

  function worker(slot: number): Promise<OcrWorker> {
    if (aborted) return Promise.reject(cancellation());
    workers[slot] ??= (async () => {
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

  // A worker holds one page mode's parameters, so each pass owns its worker
  // from setParameters through recognize. Slots are handed out first come, first served.
  function acquire() {
    clearTimeout(idleTimer);
    const slot = idle.pop() ?? (started < poolSize ? started++ : undefined);
    if (slot !== undefined) return Promise.resolve(slot);
    return new Promise<number>((resolve) => waiting.push(resolve));
  }
  function release(slot: number) {
    if (slot < 0) return;
    const next = waiting.shift();
    if (next) next(slot);
    else idle.push(slot);
    // Each worker keeps the heap of the largest image it read, so a pool left
    // idle after a burst gives that memory back; the next file starts fresh workers.
    if (idle.length === started && !closed) {
      idleTimer = setTimeout(() => {
        for (const slot of idle) void retire(slot);
      }, idleMillis);
      idleTimer.unref?.();
    }
  }
  function acquireLarge() {
    if (largeActive < LARGE_OCR_PASSES) {
      largeActive += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => largeWaiting.push(resolve));
  }
  function releaseLarge() {
    const next = largeWaiting.shift();
    if (next) next();
    else largeActive -= 1;
  }
  // The next pass in this slot starts a fresh worker with a small heap.
  async function retire(slot: number) {
    const current = workers[slot];
    workers[slot] = undefined;
    // A hung terminate must not hold a large-image token for the rest of the session.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      current?.then((done) => done.terminate()).catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
      }),
    ]);
    clearTimeout(timer);
  }
  // A pass may prepare its bytes once it holds a worker, so at most `poolSize`
  // rotated copies are alive at once across every file.
  async function pass(input: Buffer | (() => Promise<Buffer>), psm: number, large = false) {
    if (large) await acquireLarge();
    try {
      if (aborted) throw cancellation();
      const slot = await acquire();
      try {
        if (aborted) throw cancellation();
        const bytes = typeof input === "function" ? await input() : input;
        if (aborted) throw cancellation();
        const current = await worker(slot);
        if (aborted) throw cancellation();
        await current.setParameters({ tessedit_pageseg_mode: String(psm) });
        if (aborted) throw cancellation();
        return await current.recognize(bytes);
      } finally {
        if (large && slot >= 0 && !aborted) await retire(slot);
        release(slot);
      }
    } finally {
      if (large) releaseLarge();
    }
  }
  // The passes run at once and are judged in the order given, so a tie never depends on
  // which finished first. The first failure in that order fails the image, after its siblings settle.
  async function passes(runs: Promise<Awaited<ReturnType<typeof pass>>>[]) {
    const results = await Promise.allSettled(runs);
    return results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
  }

  async function recognizeImage(input: Buffer) {
    // Decoded before the worker: tesseract.js can otherwise emit an uncaught
    // main-process exception for corrupt bytes.
    const source = sharp(await sharpImageInput(input), { limitInputPixels: maxImagePixels });
    const { width: sourceWidth, height: sourceHeight } = (await source.metadata()).autoOrient;
    const sourcePixels = sourceWidth * sourceHeight;
    const scale = Math.min(
      1,
      Math.sqrt(MAX_OCR_PIXELS / sourcePixels),
      Math.max(
        Math.sqrt(OCR_PIXELS / sourcePixels),
        MIN_OCR_EDGE / Math.min(sourceWidth, sourceHeight),
      ),
    );
    const [width, height] = [Math.floor(sourceWidth * scale), Math.floor(sourceHeight * scale)];
    // Tesseract only needs lossless bytes in a format it reads, so it gets the fastest PNG.
    const image = await source
      .rotate()
      .resize(scale < 1 ? { width, height, fit: "fill" } : {})
      .png({ compressionLevel: 1 })
      .toBuffer();
    const large = width * height > OCR_PIXELS;
    // A rotated copy is read on its bounding canvas, about 1.5 times the pixels at 15 degrees.
    const largeAt = (angle: number) => {
      const radians = (Math.abs(angle) * Math.PI) / 180;
      const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
      return (width * cos + height * sin) * (width * sin + height * cos) > OCR_PIXELS;
    };
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
    const readClearly = () => bestWordCount >= 8 && bestConfidence >= 70;
    for (const psm of [3, 6, 7]) {
      consider(await pass(image, psm, large));
      if (readClearly()) return bestText;
    }
    if (bestWordCount === 0 || bestConfidence < 70) {
      const highContrast = await sharp(image)
        .grayscale()
        .threshold(225)
        .png({ compressionLevel: 1 })
        .toBuffer();
      consider(await pass(highContrast, 6, large));
    }
    // Most photos have no text and read as one stray word or low-confidence noise.
    // Straightening needs some real text to work with, and costs six more reads.
    if (!readClearly() && bestWordCount >= 2 && bestConfidence >= 30) {
      const rotations = [-15, -10, -5, 5, 10, 15].map((angle) =>
        pass(
          () =>
            sharp(image)
              .rotate(angle, { background: "#ffffff" })
              .png({ compressionLevel: 1 })
              .toBuffer(),
          6,
          largeAt(angle),
        ),
      );
      for (const result of await passes(rotations)) consider(result);
    }
    return bestText;
  }

  function recognize(input: Buffer) {
    if (closed) return Promise.reject(new Error("OCR is closed"));
    const work = recognizeImage(input);
    const settled = work.catch(() => {});
    inFlight.add(settled);
    void settled.then(() => inFlight.delete(settled));
    // A terminated Tesseract worker need not settle its recognize promise. The
    // public result is cancellable independently, including files still waiting for a worker.
    return new Promise<string>((resolve, reject) => {
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
  }
  function close() {
    closed = true;
    clearTimeout(idleTimer);
    closing ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.all(inFlight),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, shutdownGraceMillis);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      aborted = true;
      for (const reject of pending) reject(cancellation());
      pending.clear();
      // Passes still waiting for a worker wake, see the abort and stop.
      for (const wake of waiting.splice(0)) wake(-1);
      for (const wake of largeWaiting.splice(0)) {
        largeActive += 1;
        wake();
      }
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
