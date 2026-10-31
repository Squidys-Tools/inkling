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
