import { describe, expect, test } from "bun:test";
import { PIN_RAIL_LIMIT, pinRailItems, showsPinRail } from "./pins";

type Row = { id: string; favorite?: boolean };

describe("pinRailItems", () => {
  test("keeps only pinned items, in library order", () => {
    const rows: Row[] = [
      { id: "a", favorite: true },
      { id: "b" },
      { id: "c", favorite: true },
    ];
    expect(pinRailItems(rows).map((row) => row.id)).toEqual(["a", "c"]);
  });

  test("treats a missing flag as unpinned", () => {
    expect(pinRailItems([{ id: "a" }, { id: "b", favorite: false }])).toEqual([]);
  });

  test("caps the rail and leaves the rest to the Top of mind view", () => {
    const rows = Array.from({ length: PIN_RAIL_LIMIT + 5 }, (_, index) => ({ id: String(index), favorite: true }));
    expect(pinRailItems(rows)).toHaveLength(PIN_RAIL_LIMIT);
  });

  test("ignores a negative or broken limit", () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({ id: String(index), favorite: true }));
    expect(pinRailItems(rows, -1)).toEqual([]);
    expect(pinRailItems(rows, Number.NaN)).toHaveLength(3);
  });
});

describe("showsPinRail", () => {
  const library = { activeView: "Everything", activeSpaceId: null, query: "", hasSimilaritySource: false };

  test("shows on the plain library", () => {
    expect(showsPinRail(library)).toBe(true);
  });

  test("stays out of the Top of mind view, which is already the pins", () => {
    expect(showsPinRail({ ...library, activeView: "Top of mind" })).toBe(false);
  });

  test("stays out of a Space", () => {
    expect(showsPinRail({ ...library, activeView: "Design references", activeSpaceId: "space-1" })).toBe(false);
  });

  test("stays out of a search or a similarity walk", () => {
    expect(showsPinRail({ ...library, query: "  " })).toBe(true);
    expect(showsPinRail({ ...library, query: "brutalism" })).toBe(false);
    expect(showsPinRail({ ...library, hasSimilaritySource: true })).toBe(false);
  });
});
