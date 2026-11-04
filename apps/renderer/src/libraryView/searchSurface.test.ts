import { expect, test } from "bun:test";
import { searchSurfaceFrames } from "./searchSurface.ts";

test("search glass starts at the pill bounds and reverses from its current painted bounds", () => {
  const pill = { left: 676, top: 45, width: 124, height: 34 };
  const field = { left: 388, top: 37, width: 700, height: 50 };
  const frames = searchSurfaceFrames(pill, field, "24px")!;
  expect(frames[0].transform).toBe(`translate(288px, 8px) scale(${124 / 700}, 0.68)`);
  expect(frames[1]).toEqual({ transform: "none", borderRadius: "24px" });
  const painted = { left: 500, top: 40, width: 480, height: 44 };
  expect(searchSurfaceFrames(painted, pill, "17px")![0].transform).toBe(
    `translate(-176px, -5px) scale(${480 / 124}, ${44 / 34})`,
  );
  expect(searchSurfaceFrames({ ...pill, width: 0 }, field, "24px")).toBeNull();
  expect(searchSurfaceFrames(pill, { ...field, height: 0 }, "24px")).toBeNull();
});
