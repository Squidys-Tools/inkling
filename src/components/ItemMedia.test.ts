import { describe, expect, test } from "bun:test";
import { articleHostHue, articleHostLabel, noteWordCount } from "./ItemMedia";

describe("noteWordCount", () => {
  test("returns 0 for missing descriptions", () => {
    expect(noteWordCount(undefined)).toBe(0);
  });

  test("returns 0 for empty or whitespace-only descriptions", () => {
    expect(noteWordCount("")).toBe(0);
    expect(noteWordCount("   ")).toBe(0);
    expect(noteWordCount("\n\t  \n")).toBe(0);
  });

  test("counts a single word", () => {
    expect(noteWordCount("hello")).toBe(1);
  });

  test("counts words separated by spaces", () => {
    expect(noteWordCount("quick thought for today")).toBe(4);
  });

  test("collapses irregular whitespace before counting", () => {
    expect(noteWordCount("  two   spaced\twords\nnewline  ")).toBe(4);
  });
});

describe("articleHostLabel", () => {
  test("prefers the source URL hostname without www", () => {
    expect(
      articleHostLabel({
        sourceUrl: "https://www.example.com/posts/1",
        source: "Ignored label",
      }),
    ).toBe("example.com");
  });

  test("falls back to the source label when the URL is missing or invalid", () => {
    expect(articleHostLabel({ sourceUrl: undefined, source: "The Atlantic" })).toBe("The Atlantic");
    expect(articleHostLabel({ sourceUrl: "not a url", source: "  " })).toBe("inkling");
  });
});

describe("articleHostHue", () => {
  test("is deterministic for the same host", () => {
    expect(articleHostHue("example.com")).toBe(articleHostHue("example.com"));
  });

  test("stays within the hue circle", () => {
    for (const host of ["a", "example.com", "www.github.com", "…"]) {
      const hue = articleHostHue(host);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThanOrEqual(359);
    }
  });

  test("differs for different hosts in practice", () => {
    expect(articleHostHue("example.com")).not.toBe(articleHostHue("other.org"));
  });
});
