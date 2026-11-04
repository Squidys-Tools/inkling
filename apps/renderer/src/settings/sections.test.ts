import { expect, test } from "bun:test";
import { isSettingsSection, railSections } from "./sections.ts";

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

test("a settings URL opens only a section the sheet has", () => {
  expect(["licenses", "updates", "account", "", 1, undefined].filter(isSettingsSection)).toEqual([
    "licenses",
    "updates",
  ]);
});
