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
  textTokens,
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

test("tokenizer truncation preserves the final special token at the 8192-token document limit", () => {
  const values = Array.from({ length: 8193 }, (_, index) => index);
  const typeIds = values.map((_, index) => Number(index === values.length - 1));
  const encoded = textTokens(
    { encode: () => ({ ids: values, token_type_ids: typeIds }) },
    "large document",
  );

  expect(encoded.ids).toHaveLength(8192);
  expect(encoded.typeIds).toHaveLength(8192);
  expect(encoded.ids.at(-1)).toBe(8192);
  expect(encoded.typeIds.at(-1)).toBe(1);
  expect(encoded.mask).toEqual(new Array(8192).fill(1));
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
