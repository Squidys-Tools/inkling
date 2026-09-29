import { describe, expect, it } from "bun:test";
import { isEmptyPinsView, matchesPinsView } from "./pinsView";

describe("matchesPinsView", () => {
  it("keeps only pinned items", () => {
    expect(matchesPinsView({ favorite: true })).toBe(true);
    expect(matchesPinsView({ favorite: false })).toBe(false);
    expect(matchesPinsView({})).toBe(false);
  });

  it("treats a truthy non-boolean favorite as unpinned", () => {
    expect(matchesPinsView({ favorite: 1 as unknown as boolean })).toBe(false);
  });
});

describe("isEmptyPinsView", () => {
  it("reports an empty shelf only while nothing is searched", () => {
    expect(isEmptyPinsView()).toBe(true);
    expect(isEmptyPinsView({ query: "" })).toBe(true);
    expect(isEmptyPinsView({ query: "   " })).toBe(true);
  });

  it("reports a search miss when a query or similarity search is active", () => {
    expect(isEmptyPinsView({ query: "lanterns" })).toBe(false);
    expect(isEmptyPinsView({ similaritySource: { id: "1" } })).toBe(false);
  });
});
