import { createHash } from "node:crypto";

export const SEARCH_INDEX = "embeddinggemma2-daa72c51-q8-768-v1";
export const CAPTION_MODEL = "florence2-base-ft-q8-detailed-v2";
const VECTOR_DIMENSION = 768;

export type SearchChunk = {
  id: string;
  source: string;
  page: number | null;
  text: string;
  hash: string;
};

export function contentHash(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

export function textChunks(text: string, source = "text", page: number | null = null) {
  const chunks: SearchChunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + 1800);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + 900) end = boundary;
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    const value = text.slice(start, end);
    if (value.trim()) {
      chunks.push({
        id: `${source}:${page ?? 0}:${start}`,
        source,
        page,
        text: value,
        hash: contentHash(value),
      });
    }
    if (end === text.length) break;
    start = Math.max(start + 1, end - 180);
    const code = text.charCodeAt(start);
    if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  }
  return chunks;
}

export function normalizedVector(values: ArrayLike<number>) {
  if (values.length !== VECTOR_DIMENSION)
    throw new Error("Search vector has an unexpected dimension");
  let squares = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) throw new Error("Search model returned a non-finite vector");
    squares += values[i] ** 2;
  }
  const norm = Math.sqrt(squares);
  if (norm < 1e-8) throw new Error("Search model returned a zero vector");
  return Float32Array.from(values, (value) => value / norm);
}

export function cosine(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) return Number.NEGATIVE_INFINITY;
    result += left[i] * right[i];
  }
  return result;
}

export function rankFusion(lanes: { ids: string[]; weight: number }[], limit: number) {
  const scores = new Map<string, number>();
  for (const lane of lanes) {
    [...new Set(lane.ids)].forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + lane.weight / (60 + index + 1));
    });
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export function captionTags(caption: string) {
  const stop = new Set(
    "a an the is are of on in at to with and or this that there it image photo picture showing shows sits standing sitting next front background foreground can be seen appears has have its his her their some one two three very small large white black brown blue red green yellow orange gray grey".split(
      " ",
    ),
  );
  return [
    ...new Set(
      (caption.toLowerCase().match(/[\p{L}][\p{L}\p{N}-]{2,}/gu) ?? []).filter(
        (word) => !stop.has(word),
      ),
    ),
  ].slice(0, 12);
}
