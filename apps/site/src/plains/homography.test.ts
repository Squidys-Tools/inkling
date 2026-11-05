import { describe, expect, it } from "bun:test";
import { project, type Quad, quadMatrix } from "./homography.ts";

describe("quadMatrix", () => {
  it.each<[string, Quad]>([
    [
      "the measured laptop screen",
      [
        [764, 261],
        [1108, 284],
        [1069, 535],
        [725, 479],
      ],
    ],
    [
      "a flat rectangle",
      [
        [216, 122],
        [1224, 122],
        [1224, 777],
        [216, 777],
      ],
    ],
  ])("sends the box corners onto %s", (_, quad) => {
    const matrix = quadMatrix(1280, 832, quad);
    const corners = [
      [0, 0],
      [1280, 0],
      [1280, 832],
      [0, 832],
    ] as const;
    corners.forEach(([x, y], index) => {
      const [px, py] = project(matrix, x, y);
      expect(px).toBeCloseTo(quad[index]![0], 6);
      expect(py).toBeCloseTo(quad[index]![1], 6);
    });
  });
});
