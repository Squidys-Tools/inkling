import { describe, expect, test } from "bun:test";
import { extendsList, nextGeneration } from "./gridLayout.ts";

describe("masonry layout generation", () => {
  const start = { ids: ["a", "b", "c"], generation: 0 };

  test("the next page keeps the layout", () => {
    expect(extendsList(["a", "b"], ["a", "b", "c"])).toBe(true);
    expect(nextGeneration(start, ["a", "b", "c", "d"]).generation).toBe(0);
  });

  test("an unchanged list keeps the layout", () => {
    expect(nextGeneration(start, ["a", "b", "c"]).generation).toBe(0);
    expect(nextGeneration(start, start.ids)).toBe(start);
  });

  // The Cat Dog incident: the Smart Space read again in place and fewer items matched.
  test("a list that shrinks in place starts a fresh layout", () => {
    expect(nextGeneration(start, ["a", "c"]).generation).toBe(1);
  });

  test("a reordered or replaced list starts a fresh layout", () => {
    expect(nextGeneration(start, ["c", "b", "a"]).generation).toBe(1);
    expect(nextGeneration(start, ["x", "y", "z"]).generation).toBe(1);
  });

  test("items landing on top start a fresh layout", () => {
    expect(nextGeneration(start, ["new", "a", "b", "c"]).generation).toBe(1);
  });
});
