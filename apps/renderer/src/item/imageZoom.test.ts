import { expect, test } from "bun:test";
import { clampPan, clampZoom, MAX_ZOOM, panAround } from "./imageZoom.ts";

test("zoom stays between the fitted size and the maximum", () => {
  expect(clampZoom(0.05, 0.14)).toBe(0.14);
  expect(clampZoom(100, 0.14)).toBe(MAX_ZOOM);
  expect(clampZoom(0.5, 0.14)).toBe(0.5);
});

test("an image that fits above the maximum never zooms below fit", () => {
  expect(clampZoom(10, 40)).toBe(40);
});

test("zooming around a point keeps that point under the cursor", () => {
  const anchor = { x: 120, y: -40 };
  const pan = { x: 10, y: 5 };
  const next = panAround(pan, anchor, 0.5, 2);
  // The image point under the anchor, in image pixels, is the same before and after.
  expect((anchor.x - pan.x) / 0.5).toBeCloseTo((anchor.x - next.x) / 2);
  expect((anchor.y - pan.y) / 0.5).toBeCloseTo((anchor.y - next.y) / 2);
});

test("zooming around the centre scales the pan", () => {
  expect(panAround({ x: 10, y: -4 }, { x: 0, y: 0 }, 1, 2)).toEqual({ x: 20, y: -8 });
});

test("pan stops where the image edge meets the frame", () => {
  const shown = { width: 400, height: 100 };
  const frame = { width: 200, height: 200 };
  expect(clampPan({ x: 500, y: 50 }, shown, frame)).toEqual({ x: 100, y: 0 });
});
