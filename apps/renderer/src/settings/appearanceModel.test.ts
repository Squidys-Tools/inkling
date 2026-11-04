import { expect, test } from "bun:test";
import { parseAppearance } from "./appearanceModel.ts";

test("old Appearance choices migrate, but sidebar style cannot turn Codex off", () => {
  const actual = parseAppearance(
    JSON.stringify({ sidebarStyle: "classic", viewToggle: "segmented", sidebarToggle: "edge" }),
  );
  expect(actual).toEqual({ viewToggle: "segmented", windowControlsAtRest: "hover" });
  expect(actual).not.toHaveProperty("sidebarStyle");
  expect(actual).not.toHaveProperty("sidebarToggle");
  expect(parseAppearance('{"windowControls":"inset"}')).not.toHaveProperty("windowControls");
  expect(parseAppearance(null, "segmented").viewToggle).toBe("segmented");
  expect(parseAppearance('{"viewToggle":"segmented"}', "pill").viewToggle).toBe("pill");
  expect(parseAppearance('{"viewToggle":"segmented"}', "invalid").viewToggle).toBe("segmented");
});

test("invalid or missing Appearance settings use known defaults", () => {
  for (const raw of [null, "not json", "null", "[]", '{"viewToggle":"oops"}'])
    expect(parseAppearance(raw)).toEqual({ viewToggle: "pill", windowControlsAtRest: "hover" });
});

test("the pill stays hidden at rest unless Always is chosen", () => {
  expect(parseAppearance('{"windowControlsAtRest":"always"}').windowControlsAtRest).toBe("always");
  expect(parseAppearance('{"windowControlsAtRest":"sometimes"}').windowControlsAtRest).toBe(
    "hover",
  );
});
