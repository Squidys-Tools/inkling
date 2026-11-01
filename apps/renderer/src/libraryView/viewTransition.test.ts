import { expect, test } from "bun:test";
import { entranceDelay, inViewport } from "./viewTransition.ts";

test("a grid entrance staggers down and across, a list entrance staggers down only", () => {
  expect(entranceDelay(false, 0, 0)).toBe(0);
  expect(entranceDelay(false, 0.5, 0.25)).toBeCloseTo(150);
  expect(entranceDelay(false, 1, 1)).toBeCloseTo(400);
  expect(entranceDelay(true, 0, 1)).toBe(0);
  expect(entranceDelay(true, 0.5, 0)).toBeCloseTo(140);
  expect(entranceDelay(true, 0.5, 1)).toBeCloseTo(140);
});

test("only cards intersecting the scroll viewport enter", () => {
  const view = { top: 100, bottom: 700 };
  expect(inViewport({ top: 100, bottom: 300 }, view)).toBe(true);
  expect(inViewport({ top: 690, bottom: 900 }, view)).toBe(true);
  expect(inViewport({ top: 0, bottom: 100 }, view)).toBe(false);
  expect(inViewport({ top: 700, bottom: 900 }, view)).toBe(false);
});
