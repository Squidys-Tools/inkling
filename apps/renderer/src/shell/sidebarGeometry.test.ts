import { expect, test } from "bun:test";
import { sidebarFlight, sidebarGeometry } from "./sidebarGeometry.ts";

test("sidebar FLIP preserves the painted bounds when opening and reversing", () => {
  const opening = sidebarFlight(76, 248, 1280, 1032, { a: 1, e: 0 });
  expect(248 + opening.x).toBe(76);
  expect(1032 * opening.scale).toBe(1204);
  // An opening flight at left 171, width 1109 reverses without a snap to either endpoint.
  const reversed = sidebarFlight(248, 76, 1280, 1204, { a: 1109 / 1032, e: -77 });
  expect(76 + reversed.x).toBe(171);
  expect(1204 * reversed.scale).toBeCloseTo(1109);
  expect(sidebarFlight(248, 248, 1280, 1032, { a: 1, e: 0 })).toEqual({ x: 0, scale: 1 });
});

test("sidebar flight honors the actual right gutter without an endpoint width snap", () => {
  const from = sidebarFlight(248, 76, 1280, 1196, { a: 1, e: 0 }, 8);
  expect(76 + from.x).toBe(248);
  expect(1196 * from.scale).toBeCloseTo(1024);
  expect(76 + from.x + 1196 * from.scale).toBe(1272);
  const flush = sidebarFlight(248, 76, 1280, 1204, { a: 1, e: 0 });
  expect(76 + flush.x + 1204 * flush.scale).toBe(1280);
});

test("wide Codex panel has a live width and always leaves a compact rail", () => {
  expect(sidebarGeometry(1280, true)).toMatchObject({
    inset: 248,
    contentWidth: 1032,
    scrim: false,
  });
  expect(sidebarGeometry(1280, false)).toMatchObject({
    inset: 76,
    contentWidth: 1204,
    scrim: false,
  });
});

test("narrow open sidebar overlays while compact state keeps the main panel reachable", () => {
  expect(sidebarGeometry(390, true)).toMatchObject({ inset: 0, contentWidth: 390, scrim: true });
  expect(sidebarGeometry(390, false)).toMatchObject({ inset: 76, contentWidth: 314, scrim: false });
});
