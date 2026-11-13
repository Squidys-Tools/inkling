import { expect, test } from "bun:test";
import { parseAppearance } from "./appearanceModel.ts";

test("old Appearance choices migrate, but an old sidebar style does not choose a sidebar", () => {
  const actual = parseAppearance(
    JSON.stringify({ sidebarStyle: "classic", viewToggle: "segmented", sidebarToggle: "edge" }),
  );
  expect(actual).toEqual({
    sidebar: "refined",
    viewToggle: "segmented",
    gridColumns: "4",
    windowControlsAtRest: "hover",
  });
  expect(actual).not.toHaveProperty("sidebarStyle");
  expect(actual).not.toHaveProperty("sidebarToggle");
  expect(parseAppearance('{"windowControls":"inset"}')).not.toHaveProperty("windowControls");
  expect(parseAppearance(null, "segmented").viewToggle).toBe("segmented");
  expect(parseAppearance('{"viewToggle":"segmented"}', "pill").viewToggle).toBe("pill");
  expect(parseAppearance('{"viewToggle":"segmented"}', "invalid").viewToggle).toBe("segmented");
});

test("invalid or missing Appearance settings use known defaults", () => {
  for (const raw of [null, "not json", "null", "[]", '{"viewToggle":"oops"}'])
    expect(parseAppearance(raw)).toEqual({
      sidebar: "refined",
      viewToggle: "pill",
      gridColumns: "4",
      windowControlsAtRest: "hover",
    });
});

test("Shelf is the sidebar only when chosen", () => {
  expect(parseAppearance('{"sidebar":"shelf"}').sidebar).toBe("shelf");
  expect(parseAppearance('{"sidebar":"classic"}').sidebar).toBe("refined");
});

test("the pill stays hidden at rest unless Always is chosen", () => {
  expect(parseAppearance('{"windowControlsAtRest":"always"}').windowControlsAtRest).toBe("always");
  expect(parseAppearance('{"windowControlsAtRest":"sometimes"}').windowControlsAtRest).toBe(
    "hover",
  );
});

test("the grid keeps the chosen column count, and four for anything else", () => {
  expect(parseAppearance('{"gridColumns":"6"}').gridColumns).toBe("6");
  for (const raw of ['{"gridColumns":"12"}', '{"gridColumns":5}'])
    expect(parseAppearance(raw).gridColumns).toBe("4");
});
