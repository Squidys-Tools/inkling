import { expect, test } from "bun:test";
import { searchSurfaceFrames } from "./searchSurface.ts";

test("search focus keeps text inside real field bounds and reverses from the painted size", () => {
  const pill = { left: 676, top: 45, width: 124, height: 34 };
  const field = { left: 388, top: 37, width: 700, height: 50 };
  const frames = searchSurfaceFrames(pill, field, "24px", 1)!;
  expect(frames).toEqual([
    { width: "124px", height: "34px", top: "9px", minWidth: "0px", borderRadius: "17px" },
    { width: "700px", height: "50px", top: "1px", minWidth: "0px", borderRadius: "24px" },
  ]);
  const painted = { left: 500, top: 40, width: 480, height: 44 };
  expect(searchSurfaceFrames(painted, pill, "17px", 9)![0]).toEqual({
    width: "480px",
    height: "44px",
    top: "4px",
    minWidth: "0px",
    borderRadius: "22px",
  });
  expect(searchSurfaceFrames({ ...pill, width: 0 }, field, "24px")).toBeNull();
  expect(searchSurfaceFrames(pill, { ...field, height: 0 }, "24px")).toBeNull();
});
