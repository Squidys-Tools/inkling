/** Display-only OCR screening; stored text and search indexing stay untouched. */
export function infoText(item: {
  kind: string;
  description?: string | null;
  ocrText: string;
  metadata: Record<string, unknown>;
}) {
  const caption = item.description?.trim();
  const ocr = item.ocrText.trim();
  if (item.kind.toLowerCase() !== "image" || item.metadata.screenshotHash)
    return ocr || caption || "";
  if (caption) return caption;
  const tokens = ocr.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return "";
  const words = tokens.filter((token) => {
    if (/^[a-z]+$/iu.test(token)) return token.length >= 3 && /[aeiouy]/iu.test(token);
    return /^\p{L}{2,}$/u.test(token);
  });
  return words.length / tokens.length >= 0.45 ? ocr : "";
}
