import { expect, test } from "bun:test";
import { cosine, normalizedVector, rankFusion, textChunks } from "./search-core.ts";

test("document chunks retain a buried fact and page provenance without losing Unicode", () => {
  const fact = "The blue archive key is hidden beneath the observatory stairs.";
  const text = `${"Earlier material about geology. ".repeat(180)}${fact}${" Later discussion. 🐈 ".repeat(200)}`;
  const chunks = textChunks(text, "pdf", 7);
  expect(chunks.some((chunk) => chunk.text.includes(fact))).toBe(true);
  expect(chunks.every((chunk) => chunk.page === 7 && chunk.text.length <= 1800)).toBe(true);
  expect(chunks.at(-1)?.text.endsWith("🐈 ")).toBe(true);
  expect(textChunks(" ")).toEqual([]);
});

test("nonfinite and silent zero embeddings fail instead of entering the index", () => {
  expect(() => normalizedVector(new Float32Array(768))).toThrow("zero vector");
  const values = new Float32Array(768).fill(1);
  values[10] = Number.NaN;
  expect(() => normalizedVector(values)).toThrow("non-finite");
  values[10] = 1;
  const vector = normalizedVector(values);
  expect(cosine(vector, vector)).toBeCloseTo(1, 5);
});

test("rank fusion deduplicates multiple chunks and never compares raw lane scores", () => {
  expect(
    rankFusion(
      [
        { ids: ["a", "a", "a", "b"], weight: 1 },
        { ids: ["b", "c"], weight: 1 },
      ],
      3,
    ),
  ).toEqual(["b", "a", "c"]);
});
