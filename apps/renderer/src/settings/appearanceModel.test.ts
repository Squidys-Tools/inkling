import { expect, test } from "bun:test";
import { parseAppearance } from "./appearanceModel.ts";

test("an old view toggle or sidebar style is dropped and chooses nothing", () => {
  const actual = parseAppearance(
    JSON.stringify({ sidebarStyle: "classic", viewToggle: "segmented", sidebarToggle: "edge" }),
  );
  expect(actual).toEqual({
    sidebar: "cover",
    gridColumns: "4",
    windowControlsAtRest: "hover",
  });
  expect(actual).not.toHaveProperty("viewToggle");
  expect(actual).not.toHaveProperty("sidebarStyle");
  expect(actual).not.toHaveProperty("sidebarToggle");
  expect(parseAppearance('{"windowControls":"inset"}')).not.toHaveProperty("windowControls");
});

test("invalid or missing Appearance settings use known defaults", () => {
  for (const raw of [null, "not json", "null", "[]", '{"gridColumns":"oops"}'])
    expect(parseAppearance(raw)).toEqual({
      sidebar: "cover",
      gridColumns: "4",
      windowControlsAtRest: "hover",
    });
});

test("Strip is the sidebar only when chosen, and an old Shelf choice becomes Strip", () => {
  expect(parseAppearance('{"sidebar":"strip"}').sidebar).toBe("strip");
  expect(parseAppearance('{"sidebar":"shelf"}').sidebar).toBe("strip");
  expect(parseAppearance('{"sidebar":"refined"}').sidebar).toBe("cover");
  expect(parseAppearance('{"sidebar":"classic"}').sidebar).toBe("cover");
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
