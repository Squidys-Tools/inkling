/**
 * Minimal ambient result types for the bundled Tesseract.js OCR engine.
 * These keep the benchmark typecheckable without exposing the full worker API.
 */
declare module "tesseract.js" {
  export interface TesseractResult {
    data: {
      text: string;
    };
  }

  export function recognize(
    image: string | Uint8Array | Blob,
    lang?: string,
    options?: Record<string, unknown>,
  ): Promise<TesseractResult>;
}
