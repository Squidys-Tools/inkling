import { expect, test } from "bun:test";
import { railSections, sectionFrom } from "./sections.ts";

test("Appearance is a real Settings route, without a sidebar-style switch", () => {
  expect(sectionFrom("appearance")).toBe("appearance");
  expect(railSections.some(({ id }) => id === "appearance")).toBe(true);
  expect(sectionFrom("licenses")).toBe("licenses");
  expect(sectionFrom("invalid")).toBe("general");
});
