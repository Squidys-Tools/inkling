import { describe, expect, test } from "bun:test";
import { noteWordCount } from "./ItemMedia";

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
