import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const maxCanvasEdge = 8192;
const maxCanvasPixels = 16_777_216;
const maxThumbnailEdge = 512;
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

async function openDocument(bytes) {
  if (!bytes?.length) throw new Error("PDF bytes cannot be empty");
  const library = await pdfjs();
  const loadingTask = library.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  return { library, loadingTask };
}

const isPositiveFinite = (value) => Number.isFinite(value) && value > 0;

async function renderFirstPageThumbnail(page) {
  const natural = page.getViewport({ scale: 1 });
  if (!isPositiveFinite(natural.width) || !isPositiveFinite(natural.height))
    throw new Error("PDF page size is not a finite positive number");
  const viewport = page.getViewport({
    scale: maxThumbnailEdge / Math.max(natural.width, natural.height),
  });
  if (!isPositiveFinite(viewport.width) || !isPositiveFinite(viewport.height))
    throw new Error("PDF thumbnail size is not a finite positive number");
  const edge = (value) => Math.min(maxThumbnailEdge, Math.max(1, Math.round(value)));
  const canvas = createCanvas(edge(viewport.width), edge(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toBuffer("image/png");
}

export async function renderPdfFirstPage(bytes) {
  const { loadingTask } = await openDocument(bytes);
  try {
    const page = await (await loadingTask.promise).getPage(1);
    try {
      return await renderFirstPageThumbnail(page);
    } finally {
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

export async function extractPdfTextByPages(
  bytes,
  { recognize, onProgress = () => {}, ocrEngineName = "tesseract.js", onFirstPageThumbnail } = {},
) {
  const { library, loadingTask } = await openDocument(bytes);
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
      if (pageNumber === 1 && onFirstPageThumbnail) {
        try {
          await onFirstPageThumbnail(await renderFirstPageThumbnail(page));
        } catch {}
      }
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
