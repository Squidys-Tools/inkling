import { expect, test } from "bun:test";
import { parseSpaceThumbs, thumbPaths } from "./spaceThumbs.ts";

test("stored Space thumbnails keep only lists of paths, three at most", () => {
  expect(
    parseSpaceThumbs(
      JSON.stringify({
        kept: ["assets/items/a/thumb.webp"],
        long: ["a", "b", "c", "d"],
        mixed: ["a", 1],
        text: "assets/items/a/thumb.webp",
      }),
    ),
  ).toEqual({ kept: ["assets/items/a/thumb.webp"], long: ["a", "b", "c"] });
  for (const raw of [null, "not json", "null", "[]", '"text"'])
    expect(parseSpaceThumbs(raw)).toEqual({});
});

test("a stack takes the newest cards that have a thumbnail", () => {
  const cards = ["a", null, "b", "c"].map((thumbnailPath) => ({ thumbnailPath }));
  expect(thumbPaths(cards, 2)).toEqual(["a", "b"]);
});
