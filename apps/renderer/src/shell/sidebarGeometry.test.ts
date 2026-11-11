import { expect, test } from "bun:test";
import { parseSpaceCounts } from "../library/spaceCounts.ts";
import { dragSteps, sidebarClip, sidebarLabelFrames } from "./sidebarGeometry.ts";

test("a dragged Space moves one place per row crossed and never leaves the list", () => {
  // Third of five rows, 34px apart.
  const steps = (offset: number) => dragSteps(offset, 34, 2, 4);
  expect([0, 16, -16].map(steps)).toEqual([0, 0, 0]);
  expect([18, 60, -18, -60].map(steps)).toEqual([1, 2, -1, -2]);
  expect([900, -900].map(steps)).toEqual([2, -2]);
  expect(dragSteps(-900, 34, 0, 4)).toBe(0);
  expect(dragSteps(900, 34, 4, 4)).toBe(0);
});

test("remembered Smart Space counts drop anything that is not a count", () => {
  expect(parseSpaceCounts('{"a":12,"b":-1,"c":"7","d":1.5,"e":null,"f":0}')).toEqual({
    a: 12,
    f: 0,
  });
  for (const stored of [null, "", "not json", "[3]", "7", "null"])
    expect(parseSpaceCounts(stored)).toEqual({});
});

test("retained sidebar keeps an 8px gap and round right edge throughout the slide", () => {
  for (const frameLeft of [76, 100, 171, 220, 248]) {
    const clipped = sidebarClip(frameLeft, 240);
    expect(240 - clipped).toBe(frameLeft - 8);
  }
  expect(sidebarClip(76, 68)).toBe(0);
  expect(sidebarClip(248, 240)).toBe(0);
  expect(sidebarClip(500, 240)).toBe(0);
});

test("labels leave before the edge clips them, arrive after it opens, and reverse from their painted opacity", () => {
  expect(sidebarLabelFrames(1, false, false)).toEqual([
    { opacity: 1, offset: 0 },
    { opacity: 0, offset: 0.18 },
    { opacity: 0, offset: 1 },
  ]);
  expect(sidebarLabelFrames(1, true, false)).toEqual([
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: 0.8 },
    { opacity: 1, offset: 1 },
  ]);
  expect(sidebarLabelFrames(0.4, false, true)[0]).toEqual({ opacity: 0.4, offset: 0 });
  expect(sidebarLabelFrames(0.2, true, true)[0]).toEqual({ opacity: 0.2, offset: 0 });
});
