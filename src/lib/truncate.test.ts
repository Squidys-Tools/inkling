import { expect, test } from "bun:test";

import { truncate } from "./truncate";

test("leaves a short string untouched", () => {
  expect(truncate("hello", 240)).toBe("hello");
});

test("cuts at the limit in code points, not UTF-16 units", () => {
  // Two astral characters are four UTF-16 units, so a unit-based cut at 3
  // lands mid-character and yields a lone surrogate that renders as a
  // replacement glyph.
  expect(truncate("aa\u{1F600}\u{1F600}", 3)).toBe("aa\u{1F600}");
  expect(truncate("aa\u{1F600}\u{1F600}", 3)).not.toContain("\uFFFD");
});

test("never ends on half a character at any limit", () => {
  const emoji = "\u{1F600}";
  for (let max = 0; max <= 6; max += 1) {
    const cut = truncate(`${emoji.repeat(4)}`, max);
    // A well-formed cut has an even number of UTF-16 units per character, so a
    // trailing lone surrogate shows up as an unpaired high or low surrogate.
    const last = cut.charCodeAt(cut.length - 1);
    const unpairedHigh = last >= 0xd800 && last <= 0xdbff;
    expect(unpairedHigh, `limit ${max} produced a lone surrogate`).toBe(false);
    expect(cut.length, `limit ${max}`).toBeLessThanOrEqual(max * 2);
  }
});

test("counts rare CJK code points as one each", () => {
  expect(Array.from(truncate("\u{20BB7}\u{20BB7}\u{20BB7}", 2))).toHaveLength(2);
});