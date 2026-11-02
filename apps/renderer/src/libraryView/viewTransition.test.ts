import { expect, test } from "bun:test";
import { entranceDelay, inViewport } from "./viewTransition.ts";

test("entrance stagger is bounded for list and grid", () => {
  for (const list of [false, true]) {
    expect(entranceDelay(list, 0, 0)).toBe(0);
    expect(entranceDelay(list, 20, 20)).toBe(160);
    expect(entranceDelay(list, -1, -1)).toBe(0);
  }
});
test("only intersecting cards animate", () => {
  const view = { top: 100, bottom: 800 };
  expect(inViewport({ top: 40, bottom: 140 }, view)).toBe(true);
  expect(inViewport({ top: 800, bottom: 900 }, view)).toBe(false);
  expect(inViewport({ top: 0, bottom: 100 }, view)).toBe(false);
});
