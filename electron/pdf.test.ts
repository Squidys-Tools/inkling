import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPdfTextByPages } from "./pdf.mjs";

test("PDF.js extracts normalized text per page", async () => {
  const result = await extractPdfTextByPages(
    readFileSync("benchmarks/corpus/pdfs/pdf-multicolumn-01.pdf"),
  );
  expect(result.pages).toHaveLength(1);
  expect(result.engine).toBe("pdf-text");
  expect(result.text.toLowerCase()).toContain("field notes");
  expect(result.text).toContain("margin");
});

test("PDF.js renders scanned pages for OCR and keeps text page-separated", async () => {
  const result = await extractPdfTextByPages(
    readFileSync("benchmarks/corpus/pdfs/pdf-scanned-01.pdf"),
    {
      recognize: async (image) => {
        expect(Buffer.from(image).subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
        return "MEMORANDUM inventory warehouse sprouted bulbs";
      },
    },
  );
  expect(result).toMatchObject({
    engine: "pdf-text+tesseract.js",
    ocrPages: 1,
    pages: ["MEMORANDUM inventory warehouse sprouted bulbs"],
  });
  expect(result.text).toContain("sprouted bulbs");
});
