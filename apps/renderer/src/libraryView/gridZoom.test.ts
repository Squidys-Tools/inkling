import { expect, test } from "bun:test";
import { accumulateWheel, nextColumns, zoomKey } from "./gridZoom.ts";

test("zoom steps through the Appearance column choices and stops at either end", () => {
  expect(nextColumns("4", "fewer")).toBe("3");
  expect(nextColumns("4", "more")).toBe("5");
  expect(nextColumns("3", "fewer")).toBe("3");
  expect(nextColumns("6", "more")).toBe("6");
  expect(nextColumns("6", "reset")).toBe("4");
});

test("zoom keys take Cmd on macOS and Ctrl elsewhere", () => {
  const key = (key: string, mods: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });
  for (const [event, platform, step] of [
    [key("=", { ctrlKey: true }), "win32", "fewer"],
    [key("+", { ctrlKey: true }), "linux", "fewer"],
    [key("-", { ctrlKey: true }), "win32", "more"],
    [key("0", { ctrlKey: true }), "win32", "reset"],
    [key("=", { metaKey: true }), "darwin", "fewer"],
    [key("-", { metaKey: true }), "darwin", "more"],
    [key("=", { metaKey: true }), "win32", null],
    [key("=", { ctrlKey: true }), "darwin", null],
    [key("-", { ctrlKey: true, altKey: true }), "win32", null],
    [key("-", {}), "win32", null],
    [key("k", { ctrlKey: true }), "win32", null],
  ] as const)
    expect(zoomKey(event, platform)).toBe(step);
});

test("one mouse notch is one step, and small pinch deltas add up to one", () => {
  const roll = (deltas: number[], deltaMode = 0) => {
    let travel = 0;
    const steps: string[] = [];
    for (const deltaY of deltas) {
      const result = accumulateWheel(travel, { deltaY, deltaMode });
      travel = result.travel;
      if (result.step) steps.push(result.step);
    }
    return steps;
  };
  expect(roll([100])).toEqual(["more"]);
  expect(roll([-100])).toEqual(["fewer"]);
  expect(roll([125, 125, 125])).toEqual(["more", "more", "more"]);
  expect(roll([3], 1)).toEqual(["more"]);
  expect(roll(Array(10).fill(-4))).toEqual([]);
  expect(roll(Array(15).fill(-4))).toEqual(["fewer"]);
  expect(roll([30, -30, 30])).toEqual([]);
  expect(roll([0, 0])).toEqual([]);
});
