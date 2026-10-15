import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const maxCanvasEdge = 8192;
const maxCanvasPixels = 16_777_216;
const minTextLayerCharacters = 500;
let pdfjsPromise;

async function pdfjs() {
  globalThis.DOMMatrix ??= DOMMatrix;
  globalThis.ImageData ??= ImageData;
  globalThis.Path2D ??= Path2D;
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

function normalizeText(value) {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

async function renderPage(page, canvasModule) {
  const naturalViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    2,
    maxCanvasEdge / naturalViewport.width,
    maxCanvasEdge / naturalViewport.height,
    Math.sqrt(maxCanvasPixels / (naturalViewport.width * naturalViewport.height)),
  );
  const viewport = page.getViewport({ scale });
  const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toBuffer("image/png");
}

export async function extractPdfTextByPages(
  bytes,
  { recognize, onProgress = () => {}, ocrEngineName = "tesseract.js" } = {},
) {
  if (!bytes?.length) throw new Error("PDF bytes cannot be empty");
  const library = await pdfjs();
  const loadingTask = library.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pages = [];
  let ocrPages = 0;

  try {
    const document = await loadingTask.promise;
    const imageOperations = new Set(
      [
        library.OPS.paintImageXObject,
        library.OPS.paintInlineImageXObject,
        library.OPS.paintJpegXObject,
        library.OPS.paintImageMaskXObject,
        library.OPS.paintImageMaskXObjectGroup,
        library.OPS.paintImageGroup,
      ].filter((operation) => typeof operation === "number"),
    );
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const contents = await page.getTextContent();
      let text = normalizeText(
        contents.items.map((item) => ("str" in item ? item.str : "")).join(" "),
      );
      let hasRasterImage = false;
      if (recognize && text.length < minTextLayerCharacters) {
        const operators = await page.getOperatorList();
        hasRasterImage = operators.fnArray.some((operation) => imageOperations.has(operation));
      }
      if (recognize && (!text || (text.length < minTextLayerCharacters && hasRasterImage))) {
        onProgress(
          pageNumber - 1,
          document.numPages,
          `OCR page ${pageNumber} of ${document.numPages}`,
        );
        const image = await renderPage(page, { createCanvas });
        const ocrText = normalizeText(await recognize(image));
        if (ocrText) {
          text = text ? `${text}\n${ocrText}` : ocrText;
          ocrPages += 1;
        }
      }
      pages.push(text);
      page.cleanup();
      onProgress(pageNumber, document.numPages, text ? "Reading PDF text" : "No text found");
    }
  } finally {
    await loadingTask.destroy();
  }

  return {
    pages,
    text: pages.filter(Boolean).join("\n\n"),
    engine: ocrPages ? `pdf-text+${ocrEngineName}` : "pdf-text",
    ocrPages,
  };
}
