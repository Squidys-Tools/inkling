import { expect, test } from "bun:test";
import { sidebarGeometry } from "./sidebarGeometry.ts";

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
