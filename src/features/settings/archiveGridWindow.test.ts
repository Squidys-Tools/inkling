import { describe, expect, test } from "bun:test";
import { archiveColumnCount, archiveGridWindow } from "./archiveGridWindow";

const ROW_HEIGHT = 186;
const ROW_GAP = 22;
const PITCH = ROW_HEIGHT + ROW_GAP;
const COLUMNS = 3;

function windowAt(scrollTop: number, viewportHeight: number, itemCount = 100, overscanRows = 1) {
  return archiveGridWindow({
    itemCount,
    columns: COLUMNS,
    rowHeight: ROW_HEIGHT,
    rowGap: ROW_GAP,
    scrollTop,
    viewportHeight,
    overscanRows,
  });
}

describe("archiveColumnCount", () => {
  test("fits as many 179px tiles with 14px gaps as the width allows", () => {
    expect(archiveColumnCount(0, 179, 14)).toBe(1);
    expect(archiveColumnCount(371, 179, 14)).toBe(1);
    expect(archiveColumnCount(372, 179, 14)).toBe(2);
    expect(archiveColumnCount(564, 179, 14)).toBe(2);
    expect(archiveColumnCount(565, 179, 14)).toBe(3);
  });
});

describe("archiveGridWindow", () => {
  test("mounts the rows at the top with a spacer for the rows below", () => {
    const result = windowAt(0, 400);
    // Rows 0-2 cover the 400px viewport, plus one overscan row.
    expect(result.firstIndex).toBe(0);
    expect(result.endIndex).toBe(9);
    expect(result.paddingTop).toBe(0);
    expect(result.paddingBottom).toBe((34 - 3) * PITCH);
  });

  test("mounts only the rows around a mid-list scroll position", () => {
    const result = windowAt(1000, 400);
    // 1000px is row 4, so rows 3-7 are mounted with one overscan row each side.
    expect(result.firstIndex).toBe(3 * COLUMNS);
    expect(result.endIndex).toBe(8 * COLUMNS);
    expect(result.paddingTop).toBe(3 * PITCH);
    expect(result.paddingBottom).toBe((34 - 8) * PITCH);
  });

  test("keeps the full scroll height whatever the scroll position", () => {
    const fullHeight = Math.ceil(100 / COLUMNS) * ROW_HEIGHT + (34 - 1) * ROW_GAP;
    for (let scrollTop = 0; scrollTop <= 8000; scrollTop += 137) {
      const result = windowAt(scrollTop, 600);
      const mountedRows = Math.ceil((result.endIndex - result.firstIndex) / COLUMNS);
      const mountedHeight = mountedRows * ROW_HEIGHT + (mountedRows - 1) * ROW_GAP;
      expect(result.paddingTop + mountedHeight + result.paddingBottom).toBe(fullHeight);
    }
  });

  test("clamps to the last row and leaves no bottom spacer when scrolled past the end", () => {
    const result = windowAt(1_000_000, 400, 10);
    expect(result.firstIndex).toBe(9);
    expect(result.endIndex).toBe(10);
    expect(result.paddingBottom).toBe(0);
  });

  test("returns an empty window for an empty archive", () => {
    expect(windowAt(0, 400, 0)).toEqual({
      firstIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
    });
  });
});
