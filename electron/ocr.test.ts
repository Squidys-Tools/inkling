import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTesseractOcr } from "./ocr.mjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("Tesseract reads the bundled English model without fetching language data", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-test-"));
  roots.push(cacheDirectory);
  const ocr = createTesseractOcr({ cacheDirectory });
  try {
    const text = await ocr.recognize(readFileSync("benchmarks/corpus/images/image-columns-01.png"));
    expect(text.toLowerCase()).toContain("field notes");
    expect(text.toLowerCase()).toContain("libraries");
  } finally {
    await ocr.close();
  }
});

test("Tesseract prefers non-empty text and deskews rotated blocks", async () => {
  const cacheDirectory = mkdtempSync(join(tmpdir(), "inkling-tesseract-test-"));
  roots.push(cacheDirectory);
  const ocr = createTesseractOcr({ cacheDirectory });
  try {
    const meme = await ocr.recognize(readFileSync("benchmarks/corpus/images/image-meme-01.png"));
    const rotated = await ocr.recognize(
      readFileSync("benchmarks/corpus/images/image-rotated-01.png"),
    );
    expect(meme.toLowerCase()).toContain("will just save one link");
    expect(meme.toLowerCase()).toContain("another 47 tabs");
    expect(rotated.toLowerCase()).toContain("expedition set out");
  } finally {
    await ocr.close();
  }
});
