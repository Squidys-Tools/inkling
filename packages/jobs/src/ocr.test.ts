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

test("deskew uses two bounded workers, keeps tie order and serializes files through close", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-pool-"));
  roots.push(cacheDirectory);
  let count = 0;
  let active = 0;
  let peak = 0;
  let calls = 0;
  const terminated: number[] = [];
  const cachePaths: unknown[] = [];
  const ocr = createTesseractOcr({
    cacheDirectory,
    workerFactory: async (_language, _oem, options) => {
      const slot = count++;
      cachePaths.push(options.cachePath);
      let busy = false;
      return {
        setParameters: async () => {
          expect(busy).toBe(false);
        },
        recognize: async () => {
          expect(busy).toBe(false);
          busy = true;
          active++;
          peak = Math.max(peak, active);
          calls++;
          await new Promise((resolve) => setTimeout(resolve, slot ? 1 : 10));
          busy = false;
          active--;
          return { data: { text: slot ? "second" : "first", confidence: 50 } };
        },
        terminate: async () => {
          expect(active).toBe(0);
          terminated.push(slot);
        },
      };
    },
  });
  const bytes = fixture("image-columns-01.png");
  const first = ocr.recognize(bytes);
  const second = ocr.recognize(bytes);
  const closing = ocr.close();
  await expect(ocr.recognize(bytes)).rejects.toThrow("OCR is closed");
  expect(await first).toBe("first");
  expect(await second).toBe("first");
  await closing;
  expect(calls).toBe(20);
  expect(count).toBe(2);
  expect(peak).toBe(2);
  expect(new Set(cachePaths).size).toBe(2);
  expect(terminated.sort()).toEqual([0, 1]);
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
