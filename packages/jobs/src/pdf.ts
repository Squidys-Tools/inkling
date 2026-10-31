import type { Canvas } from "@napi-rs/canvas";
import { dirname } from "node:path";
import { pdfResourcePaths } from "./pdf-resources.ts";
import { fileURLToPath } from "node:url";
import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

const maxCanvasEdge = 8192;
const maxCanvasPixels = 16_777_216;
const maxThumbnailEdge = 512;
const minTextLayerCharacters = 500;
const pdfResources = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));

/** Shares one load between callers, but forgets a failed one so the next call tries again. */
export function loadOnce<A>(load: () => Promise<A>) {
  let pending: Promise<A> | undefined;
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}

const nativeCanvas = loadOnce(async () => {
  // Electron's Linux fontconfig initialization crashes the native font scan; use PDF fonts instead.
  const skipFontScan = process.platform === "linux" && Boolean(process.versions.electron);
  const previous = process.env.DISABLE_SYSTEM_FONTS_LOAD;
  if (skipFontScan) process.env.DISABLE_SYSTEM_FONTS_LOAD = "1";
  try {
    return await import("@napi-rs/canvas");
  } finally {
    if (skipFontScan) {
      if (previous === undefined) delete process.env.DISABLE_SYSTEM_FONTS_LOAD;
      else process.env.DISABLE_SYSTEM_FONTS_LOAD = previous;
    }
  }
});

async function pdfjs() {
  // pdf.js expects browser canvas globals; @napi-rs/canvas provides compatible ones.
  const { DOMMatrix, ImageData, Path2D } = await nativeCanvas();
  const canvasGlobals = globalThis as Record<string, unknown>;
  canvasGlobals.DOMMatrix ??= DOMMatrix;
  canvasGlobals.ImageData ??= ImageData;
  canvasGlobals.Path2D ??= Path2D;
  return loadPdfjs();
}

// pdf.js takes its Node paths only in Electron's main process, so a utility
// process poses as one while both modules load. Preloading the worker module
// as `pdfjsWorker` keeps pdf.js from importing it later, after the pose ends.
const loadPdfjs = loadOnce(async () => {
  const restoreType = poseAsMainProcess();
  try {
    const [library, worker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ]);
    (globalThis as Record<string, unknown>).pdfjsWorker = worker;
    return library;
  } finally {
    restoreType();
  }
});

// Electron may define `type` as a getter or a fixed property, so the pose
// changes only what the descriptor allows and puts the original back.
function poseAsMainProcess() {
  const type = Object.getOwnPropertyDescriptor(process, "type");
  if (type?.configurable) {
    Object.defineProperty(process, "type", {
      configurable: true,
      enumerable: type.enumerable,
      writable: true,
      value: "browser",
    });
    return () => Object.defineProperty(process, "type", type);
  }
  if (type?.writable && Reflect.set(process, "type", "browser"))
    return () => Reflect.set(process, "type", type.value);
  return () => {};
}

function normalizeText(value: string) {
  return value.split(/\s+/).filter(Boolean).join(" ");
}

async function renderPage(page: PDFPageProxy) {
  const naturalViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(
    2,
    maxCanvasEdge / naturalViewport.width,
    maxCanvasEdge / naturalViewport.height,
    Math.sqrt(maxCanvasPixels / (naturalViewport.width * naturalViewport.height)),
  );
  const viewport = page.getViewport({ scale });
  const { createCanvas } = await nativeCanvas();
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render(renderParameters(canvas, viewport)).promise;
  return canvas.toBuffer("image/png");
}

async function openDocument(bytes: Uint8Array) {
  if (!bytes.length) throw new Error("PDF bytes cannot be empty");
  const library = await pdfjs();
  const loadingTask = library.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: process.platform !== "linux",
    ...pdfResourcePaths(pdfResources),
    cMapPacked: true,
  });
  return { library, loadingTask };
}

const isPositiveFinite = (value: number) => Number.isFinite(value) && value > 0;

// pdf.js types its canvas as the DOM one; the @napi-rs/canvas context is API compatible.
function renderParameters(
  canvas: Canvas,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): Parameters<PDFPageProxy["render"]>[0] {
  return { canvasContext: canvas.getContext("2d"), viewport } as unknown as Parameters<
    PDFPageProxy["render"]
  >[0];
}

async function renderFirstPageThumbnail(page: PDFPageProxy) {
  const natural = page.getViewport({ scale: 1 });
  if (!isPositiveFinite(natural.width) || !isPositiveFinite(natural.height))
    throw new Error("PDF page size is not a finite positive number");
  const viewport = page.getViewport({
    scale: maxThumbnailEdge / Math.max(natural.width, natural.height),
  });
  if (!isPositiveFinite(viewport.width) || !isPositiveFinite(viewport.height))
    throw new Error("PDF thumbnail size is not a finite positive number");
  const edge = (value: number) => Math.min(maxThumbnailEdge, Math.max(1, Math.round(value)));
  const { createCanvas } = await nativeCanvas();
  const canvas = createCanvas(edge(viewport.width), edge(viewport.height));
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render(renderParameters(canvas, viewport)).promise;
  return canvas.toBuffer("image/png");
}

export async function renderPdfFirstPage(bytes: Uint8Array) {
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

type PdfExtractOptions = {
  recognize?: (image: Buffer) => Promise<string>;
  onProgress?: (current: number, total: number, message: string) => unknown;
  ocrEngineName?: string;
  onFirstPageThumbnail?: (png: Buffer) => unknown;
};

export async function extractPdfTextByPages(
  bytes: Uint8Array,
  {
    recognize,
    onProgress = () => {},
    ocrEngineName = "tesseract.js",
    onFirstPageThumbnail,
  }: PdfExtractOptions = {},
) {
  const { library, loadingTask } = await openDocument(bytes);
  const pages: string[] = [];
  let ocrPages = 0;

  try {
    const document = await loadingTask.promise;
    const imageOperations = new Set(
      [
        library.OPS.paintImageXObject,
        library.OPS.paintInlineImageXObject,
        library.OPS.paintImageMaskXObject,
        library.OPS.paintImageMaskXObjectGroup,
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
        const image = await renderPage(page);
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
