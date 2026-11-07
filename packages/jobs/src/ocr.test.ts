import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
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

test("a read stops as soon as it is clear, and only straightens text it can see", async () => {
  const clear = "plenty of clear words in this sample text here";
  for (const [text, confidence, reads] of [
    [clear, 95, 1],
    [clear, 50, 10],
    ["faint print", 91, 9],
    ["faint print", 20, 4],
    ["stray", 95, 3],
    ["stray", 50, 4],
    ["", 0, 4],
  ] as const) {
    const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-stages-"));
    roots.push(cacheDirectory);
    let calls = 0;
    const ocr = createTesseractOcr({
      cacheDirectory,
      workerFactory: async () => ({
        setParameters: async () => {},
        recognize: async () => {
          calls++;
          return { data: { text, confidence } };
        },
        terminate: async () => {},
      }),
    });
    try {
      await ocr.recognize(fixture("image-columns-01.png"));
    } finally {
      await ocr.close();
    }
    expect([text, confidence, calls]).toEqual([text, confidence, reads]);
  }
});

test("an image reads upright and at most at the size limit", async () => {
  const solid = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: "#ffffff" } });
  for (const [image, width, height] of [
    [await solid(600, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer(), 200, 600],
    [await solid(4000, 3000).jpeg().toBuffer(), 2828, 2121],
    [await solid(3000, 4000).withMetadata({ orientation: 6 }).jpeg().toBuffer(), 2828, 2121],
  ] as const) {
    const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-size-"));
    roots.push(cacheDirectory);
    const reads: Buffer[] = [];
    const ocr = createTesseractOcr({
      cacheDirectory,
      workerFactory: async () => ({
        setParameters: async () => {},
        recognize: async (read) => {
          reads.push(read);
          return {
            data: { text: "plenty of clear words in this sample text here", confidence: 95 },
          };
        },
        terminate: async () => {},
      }),
    });
    try {
      await ocr.recognize(image);
    } finally {
      await ocr.close();
    }
    expect(await sharp(reads[0]).metadata()).toMatchObject({ width, height });
  }
});

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
  // 3 page modes and contrast per file, never more than 3 at once.
  expect(stats.calls).toBe(12);
  expect(stats.count).toBe(3);
  expect(stats.peak).toBe(3);
  expect(stats.cachePaths.size).toBe(3);
});

test("a large rotated copy reads alone and replaces the worker it grew", async () => {
  // Each rotated copy's canvas is over the size limit at 3000 x 2000, and under it at 2000 x 1500.
  for (const [width, height, retired] of [
    [3000, 2000, 6],
    [2000, 1500, 0],
  ]) {
    const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-large-"));
    roots.push(cacheDirectory);
    const stats = { created: 0, terminated: 0, active: 0, peak: 0, calls: 0 };
    const secondRotation = Promise.withResolvers<void>();
    const ocr = createTesseractOcr({
      cacheDirectory,
      workers: 4,
      workerFactory: async () => {
        stats.created++;
        return {
          setParameters: async () => {},
          recognize: async () => {
            stats.calls++;
            stats.peak = Math.max(stats.peak, ++stats.active);
            // Rotations start after the 4 serial reads. Small ones must overlap to get past this.
            if (retired === 0 && stats.calls === 5) await secondRotation.promise;
            if (stats.calls === 6) secondRotation.resolve();
            await new Promise((resolve) => setTimeout(resolve, 5));
            stats.active--;
            return { data: { text: "faint print", confidence: 50 } };
          },
          terminate: async () => {
            stats.terminated++;
          },
        };
      },
    });
    const image = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    let retiredBeforeClose = 0;
    try {
      expect(await ocr.recognize(image)).toBe("faint print");
      retiredBeforeClose = stats.terminated;
    } finally {
      await ocr.close();
    }
    // Every worker that read a large copy was shut down rather than kept.
    expect(stats.calls).toBe(10);
    expect(stats.peak > 1).toBe(retired === 0);
    expect(retiredBeforeClose).toBe(retired);
    expect(stats.terminated).toBe(stats.created);
  }
});

test("an idle pool shuts its workers down and the next file starts fresh ones", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-idle-"));
  roots.push(cacheDirectory);
  const stats = { created: 0 };
  let workerTerminated!: () => void;
  const terminated = new Promise<void>((resolve) => {
    workerTerminated = resolve;
  });
  const ocr = createTesseractOcr({
    cacheDirectory,
    workers: 1,
    idleMillis: 0,
    workerFactory: async () => {
      stats.created++;
      return {
        setParameters: async () => {},
        recognize: async () => ({
          data: { text: "plenty of clear words in this sample text here", confidence: 95 },
        }),
        terminate: async () => {
          workerTerminated();
        },
      };
    },
  });
  const bytes = fixture("image-columns-01.png");
  try {
    await ocr.recognize(bytes);
    await terminated;
    await ocr.recognize(bytes);
    expect(stats.created).toBe(2);
  } finally {
    await ocr.close();
  }
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
    const closing = ocr.close();
    expect(ocr.close()).toBe(closing);
    await closing;
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
