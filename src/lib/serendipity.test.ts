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
});
