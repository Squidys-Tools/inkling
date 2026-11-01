import { expect, test } from "bun:test";
import { parseAppearance } from "./appearanceModel.ts";

test("old Appearance choices migrate, but sidebar style cannot turn Codex off", () => {
  const actual = parseAppearance(
    JSON.stringify({ sidebarStyle: "classic", viewToggle: "segmented", sidebarToggle: "edge" }),
  );
  expect(actual).toEqual({ viewToggle: "segmented", sidebarToggle: "edge" });
  expect(actual).not.toHaveProperty("sidebarStyle");
});

test("invalid or missing Appearance settings use known defaults", () => {
  for (const raw of [null, "not json", "null", "[]", '{"viewToggle":"oops"}'])
    expect(parseAppearance(raw)).toEqual({ viewToggle: "pill", sidebarToggle: "buttons" });
});
