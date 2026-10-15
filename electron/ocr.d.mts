export function createTesseractOcr(options: {
  cacheDirectory: string;
  workerFactory?: (
    language: string,
    oem: number,
    options: Record<string, unknown>,
  ) => Promise<{
    setParameters(parameters: Record<string, string>): Promise<unknown>;
    recognize(image: string | Uint8Array): Promise<{ data: { text?: string; confidence: number } }>;
    terminate(): Promise<unknown>;
  }>;
}): {
  recognize(image: string | Uint8Array): Promise<string>;
  close(): Promise<void>;
};
