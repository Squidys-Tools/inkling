import { expect, test } from "bun:test";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.mjs";
import { floatVectorBytes, layerNormalize, l2Normalize, textTokens } from "./embeddings.mjs";

test("Nomic document normalization produces a unit vector and little-endian storage bytes", () => {
  const vector = Float32Array.from([1, 2, 3]);
  layerNormalize(vector);
  l2Normalize(vector);

  expect(vector[0]).toBeCloseTo(-Math.SQRT1_2, 5);
  expect(vector[1]).toBeCloseTo(0, 5);
  expect(vector[2]).toBeCloseTo(Math.SQRT1_2, 5);
  expect(floatVectorBytes(vector).readFloatLE(0)).toBeCloseTo(vector[0], 6);
});

test("tokenizer output is capped to the Rust 8192-token document limit", () => {
  const values = Array.from({ length: 8193 }, (_, index) => index);
  const encoded = textTokens(
    { encode: () => ({ ids: values, token_type_ids: values.map(() => 0) }) },
    "large document",
  );

  expect(encoded.ids).toHaveLength(8192);
  expect(encoded.typeIds).toHaveLength(8192);
  expect(encoded.mask).toEqual(new Array(8192).fill(1));
  expect(TEXT_MODEL).toBe("nomic-embed-text-v1.5");
  expect(IMAGE_MODEL).toBe("nomic-embed-vision-v1.5-sharp");
});
