import { expect, test } from "bun:test";
import { flightDuration, originTransform, usableOrigin } from "./flightGeometry.ts";

const viewport = { left: 100, top: 50, width: 1000, height: 700 };

test("a card flight uses viewport offsets and both card dimensions", () => {
  expect(originTransform({ left: 300, top: 150, width: 250, height: 140 }, viewport)).toBe(
    "translate(200px, 100px) scale(0.25, 0.2)",
  );
  expect(flightDuration).toBe(510);
  expect(originTransform(viewport, { ...viewport, width: 0 })).toBe("none");
});

test("offscreen, mostly covered and unmeasured cards fade instead of flying", () => {
  expect(usableOrigin({ left: 200, top: 100, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 50, top: 100, width: 200, height: 200 }, viewport)).toBe(true);
  expect(usableOrigin({ left: 49, top: 100, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: 200, top: -20, width: 200, height: 200 }, viewport)).toBe(false);
  expect(usableOrigin({ left: 200, top: 100, width: 0, height: 200 }, viewport)).toBe(false);
});
