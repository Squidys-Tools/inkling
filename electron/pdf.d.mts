export function extractPdfTextByPages(
  bytes: Uint8Array,
  options?: {
    recognize?: (image: Buffer) => Promise<string>;
    onProgress?: (current: number, total: number, message: string) => void;
    ocrEngineName?: string;
  },
): Promise<{
  pages: string[];
  text: string;
  engine: string;
  ocrPages: number;
}>;
