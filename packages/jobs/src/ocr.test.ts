import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTesseractOcr } from "./ocr.ts";
import { fixture } from "./test-fixtures.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Tesseract reads the bundled English model without fetching language data", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-test-"));
  roots.push(cacheDirectory);
  const ocr = createTesseractOcr({ cacheDirectory });
  try {
    const text = await ocr.recognize(fixture("image-columns-01.png"));
    expect(text.toLowerCase()).toContain("field notes");
    expect(text.toLowerCase()).toContain("libraries");
  } finally {
    await ocr.close();
  }
});

test("Tesseract tries bounded preprocessing when the initial page modes find no text", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-test-"));
  roots.push(cacheDirectory);
  const inputs: (string | Uint8Array)[] = [];
  const ocr = createTesseractOcr({
    cacheDirectory,
    workerFactory: async () => ({
      setParameters: async () => {},
      recognize: async (image) => {
        inputs.push(image);
        return { data: { text: inputs.length <= 3 ? "" : "faint print", confidence: 91 } };
      },
      terminate: async () => {},
    }),
  });
  try {
    const text = await ocr.recognize(fixture("image-columns-01.png"));
    expect(text).toBe("faint print");
    expect(inputs).toHaveLength(10);
    expect(inputs[3]).not.toBe(inputs[0]);
  } finally {
    await ocr.close();
  }
});

test("Tesseract prefers non-empty text and deskews rotated blocks", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-test-"));
  roots.push(cacheDirectory);
  const ocr = createTesseractOcr({ cacheDirectory });
  try {
    const meme = await ocr.recognize(fixture("image-meme-01.png"));
    const rotated = await ocr.recognize(fixture("image-rotated-01.png"));
    expect(meme.toLowerCase()).toContain("will just save one link");
    expect(meme.toLowerCase()).toContain("another 47 tabs");
    expect(rotated.toLowerCase()).toContain("expedition set out");
  } finally {
    await ocr.close();
  }
});

// A stand-in worker that answers with the page mode it was set to, so a result
// shows which pass produced it.
function modeWorkers(confidence: number, delay = 5) {
  const stats = { count: 0, active: 0, peak: 0, calls: 0, cachePaths: new Set<unknown>() };
  const workerFactory = async (
    _language: string,
    _oem: number,
    options: Record<string, unknown>,
  ) => {
    stats.count++;
    stats.cachePaths.add(options.cachePath);
    let psm = "";
    let busy = false;
    return {
      setParameters: async (parameters: Record<string, string>) => {
        expect(busy).toBe(false);
        psm = parameters.tessedit_pageseg_mode;
      },
      recognize: async () => {
        expect(busy).toBe(false);
        busy = true;
        stats.active++;
        stats.peak = Math.max(stats.peak, stats.active);
        stats.calls++;
        const text = `psm${psm}`;
        await new Promise((resolve) => setTimeout(resolve, delay));
        busy = false;
        stats.active--;
        return { data: { text, confidence } };
      },
      terminate: async () => {
        expect(stats.active).toBe(0);
      },
    };
  };
  return { stats, workerFactory };
}

test("files and passes share a bounded worker pool and ties resolve in the serial order", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-pool-"));
  roots.push(cacheDirectory);
  const { stats, workerFactory } = modeWorkers(50);
  const ocr = createTesseractOcr({ cacheDirectory, workerFactory, workers: 3 });
  const bytes = fixture("image-columns-01.png");
  const files = [ocr.recognize(bytes), ocr.recognize(bytes), ocr.recognize(bytes)];
  const closing = ocr.close();
  await expect(ocr.recognize(bytes)).rejects.toThrow("OCR is closed");
  // Every pass ties on quality, so the first one judged wins: page mode 3.
  expect(await Promise.all(files)).toEqual(["psm3", "psm3", "psm3"]);
  await closing;
  // 3 page modes, contrast and 6 rotations per file, never more than 3 at once.
  expect(stats.calls).toBe(30);
  expect(stats.count).toBe(3);
  expect(stats.peak).toBe(3);
  expect(stats.cachePaths.size).toBe(3);
});

test("close cancels hung recognition and queued files even if terminate never settles recognition", async () => {
  for (const releaseOnTerminate of [false, true]) {
    const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-hung-"));
    roots.push(cacheDirectory);
    let calls = 0;
    let terminateCalls = 0;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: (error: Error) => void;
    const ocr = createTesseractOcr({
      cacheDirectory,
      shutdownGraceMillis: 20,
      // One worker, so the second file is still waiting for it when close() runs.
      workers: 1,
      workerFactory: async () => ({
        setParameters: async () => {},
        recognize: async () => {
          calls++;
          entered();
          return new Promise<never>((_resolve, reject) => {
            release = reject;
          });
        },
        terminate: async () => {
          terminateCalls++;
          if (releaseOnTerminate) release(new Error("worker terminated"));
        },
      }),
    });
    const bytes = fixture("image-columns-01.png");
    const first = ocr.recognize(bytes);
    const queued = ocr.recognize(bytes);
    const outcomes = Promise.allSettled([first, queued]);
    await started;
    const start = performance.now();
    const closing = ocr.close();
    expect(ocr.close()).toBe(closing);
    await closing;
    expect(performance.now() - start).toBeLessThan(500);
    expect((await outcomes).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toBe(1);
    expect(terminateCalls).toBe(1);
    await expect(ocr.recognize(bytes)).rejects.toThrow("OCR is closed");
  }
});

test("a corrupt image fails the OCR call before it reaches the worker", async () => {
  let workerStarted = false;
  const ocr = createTesseractOcr({
    cacheDirectory: join(tmpdir(), "inkling-tesseract-unused"),
    workerFactory: async () => {
      workerStarted = true;
      throw new Error("worker should not start");
    },
  });
  const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  await expect(ocr.recognize(truncatedJpeg)).rejects.toThrow();
  expect(workerStarted).toBe(false);
});
