import { describe, expect, test } from "bun:test";
import { serendipityItems } from "./serendipity";

type Row = { id: string; createdAt?: number; archived?: boolean; title?: string };

describe("serendipityItems", () => {
  test("picks the oldest items first", () => {
    const rows: Row[] = [
      { id: "new", createdAt: 300 },
      { id: "old", createdAt: 100 },
      { id: "mid", createdAt: 200 },
    ];
    expect(serendipityItems(rows).map((row) => row.id)).toEqual(["old", "mid", "new"]);
  });

  test("caps the batch at 12", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ id: String(index), createdAt: index + 1 }));
    expect(serendipityItems(rows)).toHaveLength(12);
  });

  test("skips archived items", () => {
    const rows: Row[] = [
      { id: "a", createdAt: 1 },
      { id: "b", createdAt: 2, archived: true },
      { id: "c", createdAt: 3 },
    ];
    expect(serendipityItems(rows).map((row) => row.id)).toEqual(["a", "c"]);
  });

  test("falls back to a stable order when createdAt is missing", () => {
    const rows: Row[] = [{ id: "b" }, { id: "a" }, { id: "c", createdAt: 1 }];
    expect(serendipityItems(rows).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  test("excludes kept items without mutating the source", () => {
    const rows: Row[] = [
      { id: "old", createdAt: 1 },
      { id: "middle", createdAt: 2 },
      { id: "new", createdAt: 3 },
    ];
    const snapshot = [...rows];

    expect(serendipityItems(rows, { excludedIds: new Set(["old"]), limit: 2 }).map((row) => row.id)).toEqual([
      "middle",
      "new",
    ]);
    expect(rows).toEqual(snapshot);
  });

  test("refills a capped batch after earlier items are kept", () => {
    const rows = Array.from({ length: 14 }, (_, index) => ({ id: String(index), createdAt: index + 1 }));

    expect(serendipityItems(rows, { excludedIds: new Set(["0", "1"]), limit: 12 }).map((row) => row.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => String(index + 2)),
    );
  });

  test("supports an empty limit", () => {
    expect(serendipityItems([{ id: "a", createdAt: 1 }], { limit: 0 })).toEqual([]);
  });
});
