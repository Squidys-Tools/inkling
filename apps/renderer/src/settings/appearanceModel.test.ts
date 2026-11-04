import { expect, test } from "bun:test";
import { chromeControlsFor, parseAppearance } from "./appearanceModel.ts";

test("old Appearance choices migrate, but sidebar style cannot turn Codex off", () => {
  const actual = parseAppearance(
    JSON.stringify({ sidebarStyle: "classic", viewToggle: "segmented", sidebarToggle: "edge" }),
  );
  expect(actual).toEqual({ viewToggle: "segmented", windowControls: "traffic-lights" });
  expect(actual).not.toHaveProperty("sidebarStyle");
  expect(actual).not.toHaveProperty("sidebarToggle");
  expect(parseAppearance(null, "segmented").viewToggle).toBe("segmented");
  expect(parseAppearance('{"viewToggle":"segmented"}', "pill").viewToggle).toBe("pill");
  expect(parseAppearance('{"viewToggle":"segmented"}', "invalid").viewToggle).toBe("segmented");
});

test("invalid or missing Appearance settings use known defaults", () => {
  for (const raw of [null, "not json", "null", "[]", '{"viewToggle":"oops"}'])
    expect(parseAppearance(raw)).toEqual({ viewToggle: "pill", windowControls: "traffic-lights" });
});

test("the inset pill replaces macOS traffic lights only when chosen", () => {
  expect(parseAppearance('{"windowControls":"inset"}').windowControls).toBe("inset");
  expect(chromeControlsFor("native-left", "inset")).toBe("custom-right");
  expect(chromeControlsFor("native-left", "traffic-lights")).toBe("native-left");
  expect(chromeControlsFor("custom-right", "traffic-lights")).toBe("custom-right");
  expect(chromeControlsFor("system-frame", "inset")).toBe("system-frame");
});
