import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractPdfTextByPages } from "./pdf.mjs";

function textPdf(pageTexts: string[]) {
  const fontId = 3 + pageTexts.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageTexts.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageTexts.length} >>`,
  ];
  for (let index = 0; index < pageTexts.length; index += 1) {
    const pageId = 3 + index * 2;
    const content = `BT /F1 12 Tf 72 720 Td (${pageTexts[index].replace(/[()\\]/g, "\\$&")}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("PDF.js extracts normalized text per page", async () => {
  const result = await extractPdfTextByPages(
    readFileSync("benchmarks/corpus/pdfs/pdf-multicolumn-01.pdf"),
  );
  expect(result.pages).toHaveLength(1);
  expect(result.engine).toBe("pdf-text");
  expect(result.text.toLowerCase()).toContain("field notes");
  expect(result.text).toContain("margin");
});

test("PDF.js preserves page order and separators in a multi-page document", async () => {
  const result = await extractPdfTextByPages(textPdf(["First page text", "Second page text"]));
  expect(result.pages).toEqual(["First page text", "Second page text"]);
  expect(result.text).toBe("First page text\n\nSecond page text");
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

test("PDF.js OCRs raster pages whose text layer is only partial", async () => {
  let recognized = 0;
  const result = await extractPdfTextByPages(
    readFileSync("benchmarks/corpus/pdfs/pdf-images-captions-01.pdf"),
    {
      recognize: async () => {
        recognized += 1;
        return "Raster caption text";
      },
    },
  );
  expect(recognized).toBe(1);
  expect(result.ocrPages).toBe(1);
  expect(result.text).toContain("Raster caption text");
  expect(result.text).toContain("Figure 1 shows the new tree line");
});
