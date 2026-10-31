// Deep entry points the image fallback imports to skip the package entry's font scan.
declare module "@napi-rs/canvas/js-binding.js" {
  export { Canvas as CanvasElement } from "@napi-rs/canvas";
}

declare module "@napi-rs/canvas/load-image.js" {
  export { loadImage as default } from "@napi-rs/canvas";
}

// pdf.js's worker half, which `pdf.ts` preloads so the fake worker reuses it.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
