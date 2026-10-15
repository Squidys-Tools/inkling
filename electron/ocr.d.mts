export function createTesseractOcr(options: { cacheDirectory: string }): {
  recognize(image: string | Uint8Array): Promise<string>;
  close(): Promise<void>;
};
