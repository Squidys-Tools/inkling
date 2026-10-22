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
  expect(glassBands([], 1, 720)).toEqual([]);
});

test("toolbar glass gets a band from the top, rounded up to a step", () => {
  expect(
    glassBands(
      [
        { y: 45, height: 34 },
        { y: 39, height: 34 },
      ],
      1,
      720,
    ),
  ).toEqual([{ top: 0, height: 256 }]);
});

test("glass at the top and bottom gets two bands of one height", () => {
  expect(
    glassBands(
      [
        { y: 45, height: 34 },
        { y: 1300, height: 34 },
      ],
      1,
      1400,
    ),
  ).toEqual([
    { top: 0, height: 256 },
    { top: 1144, height: 256 },
  ]);
});

test("bands that would cover the canvas become one", () => {
  expect(
    glassBands(
      [
        { y: 45, height: 34 },
        { y: 300, height: 34 },
      ],
      1,
      500,
    ),
  ).toEqual([{ top: 0, height: 500 }]);
});

test("a band never runs past the canvas", () => {
  expect(glassBands([{ y: -1, height: 38 }], 1.5, 54)).toEqual([{ top: 0, height: 54 }]);
  expect(glassBands([{ y: 500, height: 30 }], 1, 720)).toEqual([{ top: 436, height: 256 }]);
  expect(glassBands([{ y: 600, height: 30 }], 1, 720)).toEqual([{ top: 464, height: 256 }]);
});
