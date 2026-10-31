import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEmbeddingEngine,
  floatVectorBytes,
  hasEmbeddableCharacters,
  layerNormalize,
  l2Normalize,
  textTokenWindows,
} from "./embeddings.ts";

test("Nomic document normalization produces a unit vector and little-endian storage bytes", () => {
  const vector = Float32Array.from([1, 2, 3]);
  layerNormalize(vector);
  l2Normalize(vector);

  expect(vector[0]).toBeCloseTo(-Math.SQRT1_2, 5);
  expect(vector[1]).toBeCloseTo(0, 5);
  expect(vector[2]).toBeCloseTo(Math.SQRT1_2, 5);
  expect(floatVectorBytes(vector).readFloatLE(0)).toBeCloseTo(vector[0], 6);
});

const encoder = (ids: number[]) => ({
  encode: () => ({ ids, token_type_ids: ids.map((_, index) => Number(index === ids.length - 1)) }),
});

test("text within the 8192-token window stays one unchanged window", () => {
  const values = Array.from({ length: 8192 }, (_, index) => index);
  const windows = textTokenWindows(encoder(values), "document");

  expect(windows).toHaveLength(1);
  expect(windows[0].ids).toEqual(values);
  expect(windows[0].mask).toEqual(new Array(8192).fill(1));
});

test("text past the 8192-token window is split so every token is embedded", () => {
  // 20,000 tokens: an opening and closing special token around 19,998 of text.
  const values = Array.from({ length: 20_000 }, (_, index) => index);
  const windows = textTokenWindows(encoder(values), "large document");

  expect(windows.map((window) => window.ids.length)).toEqual([8192, 8192, 3620]);
  for (const window of windows) {
    expect(window.ids[0]).toBe(0);
    expect(window.ids.at(-1)).toBe(19_999);
    expect(window.typeIds.at(-1)).toBe(1);
    expect(window.typeIds).toHaveLength(window.ids.length);
    expect(window.mask).toHaveLength(window.ids.length);
  }
  const body = windows.flatMap((window) => window.ids.slice(1, -1));
  expect(body).toEqual(values.slice(1, -1));
});

test("Nomic text validation accepts Unicode letters and numbers", () => {
  expect(hasEmbeddableCharacters("你好")).toBe(true);
  expect(hasEmbeddableCharacters("123٤٥٦")).toBe(true);
  expect(hasEmbeddableCharacters("— … _")).toBe(false);
});

test("text-query embeddings do not download model assets during search", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-query-embedding-"));
  const cache = join(root, "models");
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("unexpected model download");
  }) as unknown as typeof fetch;

  try {
    await expect(createEmbeddingEngine(cache).embedQuery("quiet telescope")).rejects.toThrow(
      "model assets are unavailable for search",
    );
    expect(fetchCalls).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
});
