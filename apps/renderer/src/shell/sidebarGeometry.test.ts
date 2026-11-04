import { expect, test } from "bun:test";
import { sidebarClip, sidebarLabelFrames } from "./sidebarGeometry.ts";

test("retained sidebar keeps an 8px gap and round right edge throughout the slide", () => {
  for (const frameLeft of [76, 100, 171, 220, 248]) {
    const clipped = sidebarClip(frameLeft, 240);
    expect(240 - clipped).toBe(frameLeft - 8);
  }
  expect(sidebarClip(76, 68)).toBe(0);
  expect(sidebarClip(248, 240)).toBe(0);
  expect(sidebarClip(500, 240)).toBe(0);
});

test("opening-to-closing label reversal preserves painted opacity instead of flashing", () => {
  expect(sidebarLabelFrames(1, true, false)).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  expect(sidebarLabelFrames(0.4, false, true)).toEqual([{ opacity: 0.4 }, { opacity: 0 }]);
  expect(sidebarLabelFrames(0.2, true, true)).toEqual([{ opacity: 0.2 }, { opacity: 1 }]);
});
