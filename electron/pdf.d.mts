export function extractPdfTextByPages(
  bytes: Uint8Array,
  options?: {
    recognize?: (image: Buffer) => Promise<string>;
    onProgress?: (current: number, total: number, message: string) => void;
    ocrEngineName?: string;
    onFirstPageThumbnail?: (png: Buffer) => Promise<unknown> | unknown;
  },
): Promise<{
  pages: string[];
  text: string;
  engine: string;
  ocrPages: number;
}>;

export function renderPdfFirstPage(bytes: Uint8Array): Promise<Buffer>;
