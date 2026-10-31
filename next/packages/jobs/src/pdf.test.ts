import { expect, test } from "bun:test";
import { fixture, fixturePath } from "./test-fixtures.ts";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { extractPdfTextByPages, renderPdfFirstPage } from "./pdf.ts";

function rectanglePdf(rectangles: string[], rotate = 0) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${rectangles.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${rectangles.length} >>`,
  ];
  for (const [index, rectangle] of rectangles.entries()) {
    const content = `0 0 0 rg ${rectangle} re f`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /Rotate ${rotate} /MediaBox [0 0 612 792] /Contents ${4 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  const xrefOffset = pdf.indexOf("xref\n");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

async function decodePng(png: Buffer) {
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const isInk = (x: number, y: number) => {
    const index = (y * image.width + x) * 4;
    return data[index] < 128 && data[index + 3] === 255;
  };
  return { width: image.width, height: image.height, data, isInk };
}

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
  const result = await extractPdfTextByPages(fixture("pdf-multicolumn-01.pdf"));
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
  const result = await extractPdfTextByPages(fixture("pdf-scanned-01.pdf"), {
    recognize: async (image) => {
      expect(Buffer.from(image).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      return "MEMORANDUM inventory warehouse sprouted bulbs";
    },
  });
  expect(result).toMatchObject({
    engine: "pdf-text+tesseract.js",
    ocrPages: 1,
    pages: ["MEMORANDUM inventory warehouse sprouted bulbs"],
  });
  expect(result.text).toContain("sprouted bulbs");
});

test("PDF.js OCRs raster pages whose text layer is only partial", async () => {
  let recognized = 0;
  const result = await extractPdfTextByPages(fixture("pdf-images-captions-01.pdf"), {
    recognize: async () => {
      recognized += 1;
      return "Raster caption text";
    },
  });
  expect(recognized).toBe(1);
  expect(result.ocrPages).toBe(1);
  expect(result.text).toContain("Raster caption text");
  expect(result.text).toContain("Figure 1 shows the new tree line");
});

test("page-one thumbnails are opaque white PNGs within 512 pixels", async () => {
  const png = await renderPdfFirstPage(fixture("pdf-native-text-01.pdf"));
  const { width, height, data } = await decodePng(png);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(Math.max(width, height)).toBe(512);
  expect(Math.min(width, height)).toBeGreaterThan(0);
  expect([...data.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
  let darkPixels = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index] < 128) darkPixels += 1;
  expect(darkPixels).toBeGreaterThan(0);
});

test("page-one thumbnails render the first page of a multi-page document", async () => {
  const { isInk } = await decodePng(
    await renderPdfFirstPage(rectanglePdf(["36 36 180 180", "396 576 180 180"])),
  );
  expect(isInk(60, 512 - 60)).toBe(true);
  expect(isInk(512 - 60, 60)).toBe(false);
});

test("page-one thumbnails follow the page rotation", async () => {
  const { width, height } = await decodePng(
    await renderPdfFirstPage(rectanglePdf(["0 0 100 100"], 90)),
  );
  expect(width).toBe(512);
  expect(height).toBeLessThan(512);
});

test("page-one thumbnail callback runs once before text extraction continues and failures are swallowed", async () => {
  const events: string[] = [];
  const result = await extractPdfTextByPages(textPdf(["First page text", "Second page text"]), {
    onFirstPageThumbnail: (png) => {
      events.push(`thumbnail:${png.length > 0}`);
    },
    onProgress: (current) => events.push(`progress:${current}`),
  });
  expect(events).toEqual(["thumbnail:true", "progress:1", "progress:2"]);
  expect(result.pages).toEqual(["First page text", "Second page text"]);

  let calls = 0;
  const failing = await extractPdfTextByPages(textPdf(["First page text", "Second page text"]), {
    onFirstPageThumbnail: async () => {
      calls += 1;
      throw new Error("thumbnail storage failed");
    },
  });
  expect(calls).toBe(1);
  expect(failing.text).toBe("First page text\n\nSecond page text");
});

test("empty PDF bytes are rejected before any rendering or extraction", async () => {
  await expect(renderPdfFirstPage(Buffer.alloc(0))).rejects.toThrow("PDF bytes cannot be empty");
  await expect(extractPdfTextByPages(Buffer.alloc(0))).rejects.toThrow("PDF bytes cannot be empty");
});

test("pdf.js takes its Node paths inside an Electron utility process", () => {
  const script = `
    Object.defineProperty(process, "type", { value: "utility", configurable: true, enumerable: true });
    Object.defineProperty(process.versions, "electron", { value: "45.0.0", configurable: true });
    const { extractPdfTextByPages, renderPdfFirstPage } = await import(${JSON.stringify(
      pathToFileURL(join(import.meta.dir, "pdf.ts")).href,
    )});
    const bytes = await Bun.file(${JSON.stringify(fixturePath("pdf-native-text-01.pdf"))}).bytes();
    const png = await renderPdfFirstPage(bytes);
    const { text } = await extractPdfTextByPages(bytes);
    console.log(JSON.stringify({ png: png.length > 0, text: text.length > 0, type: process.type }));
  `;
  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" });
  expect(result.stderr).not.toContain("document is not defined");
  expect(JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "null")).toEqual({
    png: true,
    text: true,
    type: "utility",
  });
});
