import { expect, test } from "bun:test";
import { railSections } from "./sections.ts";

test("the Settings sheet keeps Appearance and screenshot import reachable", () => {
  expect(railSections.map(({ id }) => id)).toEqual([
    "general",
    "appearance",
    "library",
    "extension",
    "screenshots",
    "updates",
  ]);
});
