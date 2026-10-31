import { expect, test } from "bun:test";
import { glassBands, glassShape } from "./liquidGlassShape";

test("a pill keeps its box and caps the radius at half its height", () => {
  expect(
    glassShape({ x: 10, y: 8, width: 120, height: 34, radii: [999, 999, 999, 999] }, 800, 600),
  ).toEqual({ x: 10, y: 8, width: 120, height: 34, radius: 17 });
});

test("a tab with a square left side pushes that side out by the radius", () => {
  expect(
    glassShape({ x: 0, y: 39, width: 26, height: 34, radii: [0, 14, 14, 0] }, 800, 600),
  ).toEqual({ x: -14, y: 39, width: 40, height: 34, radius: 14 });
});

test("a square box stays square", () => {
  expect(glassShape({ x: 4, y: 4, width: 20, height: 20, radii: [0, 0, 0, 0] }, 800, 600)).toEqual({
    x: 4,
    y: 4,
    width: 20,
    height: 20,
    radius: 0,
  });
});

test("a box outside the canvas has no glass", () => {
  expect(
    glassShape({ x: -40, y: 10, width: 30, height: 30, radii: [8, 8, 8, 8] }, 800, 600),
  ).toBeNull();
  expect(
    glassShape({ x: 10, y: 600, width: 30, height: 30, radii: [8, 8, 8, 8] }, 800, 600),
  ).toBeNull();
});

test("no glass means no band", () => {
  expect(glassBands([], 1, 800, 720)).toEqual([]);
});

test("toolbar glass gets a band from the top, rounded up to a step", () => {
  expect(
    glassBands(
      [
        { x: 100, y: 45, width: 200, height: 34 },
        { x: 120, y: 39, width: 180, height: 34 },
      ],
      1,
      800,
      720,
    ),
  ).toEqual([{ left: 36, top: 0, width: 384, height: 256 }]);
});

test("glass at the top and bottom gets two bands of one size", () => {
  expect(
    glassBands(
      [
        { x: 100, y: 45, width: 200, height: 34 },
        { x: 500, y: 1300, width: 160, height: 34 },
      ],
      1,
      800,
      1400,
    ),
  ).toEqual([
    { left: 36, top: 0, width: 384, height: 256 },
    { left: 416, top: 1144, width: 384, height: 256 },
  ]);
});

test("bands that would cover the canvas become one", () => {
  expect(
    glassBands(
      [
        { x: 0, y: 45, width: 800, height: 34 },
        { x: 0, y: 300, width: 800, height: 34 },
      ],
      1,
      800,
      500,
    ),
  ).toEqual([{ left: 0, top: 0, width: 800, height: 500 }]);
});

test("a band never runs past the canvas", () => {
  expect(glassBands([{ x: 100, y: -1, width: 200, height: 38 }], 1.5, 800, 54)).toEqual([
    { left: 54, top: 0, width: 512, height: 54 },
  ]);
  expect(glassBands([{ x: 100, y: 500, width: 200, height: 30 }], 1, 800, 720)).toEqual([
    { left: 36, top: 436, width: 384, height: 256 },
  ]);
  expect(glassBands([{ x: 100, y: 600, width: 200, height: 30 }], 1, 800, 720)).toEqual([
    { left: 36, top: 464, width: 384, height: 256 },
  ]);
});

test("a shape at the canvas edge gets a band clamped to the canvas", () => {
  expect(glassBands([{ x: 600, y: 45, width: 160, height: 34 }], 1, 800, 720)).toEqual([
    { left: 416, top: 0, width: 384, height: 256 },
  ]);
});
