import { expect, test } from "bun:test";
import { fitsTitleEdit, nameEnd, singleLine } from "./titleEdit.ts";

test("full-length title rejects start/middle inserts without deleting its extension", () => {
  const title = `${"a".repeat(496)}.png`;
  const replace = (start: number, end: number, inserted: string) =>
    fitsTitleEdit(title.length, start, end, inserted)
      ? title.slice(0, start) + inserted + title.slice(end)
      : title;
  expect(replace(0, 0, "X")).toBe(title);
  expect(replace(250, 250, "X")).toBe(title);
  expect(replace(250, 251, "XY")).toBe(title);
  expect(replace(250, 251, "X")).toBe(`${"a".repeat(250)}X${"a".repeat(245)}.png`);
  expect(replace(0, 496, "Cat")).toBe("Cat.png");
});

test("renaming selects the name but not its file extension", () => {
  const long = "Screenshot From 2026-10-31 10-31-41.webm";
  expect(long.slice(0, nameEnd(long))).toBe("Screenshot From 2026-10-31 10-31-41");
  expect(nameEnd("archive.tar.gz")).toBe("archive.tar".length);
  expect(nameEnd("Field notes")).toBe("Field notes".length);
  expect(nameEnd(".bashrc")).toBe(".bashrc".length);
  expect(nameEnd("Wait... what")).toBe("Wait... what".length);
  expect(nameEnd("v1.5 release notes")).toBe("v1.5 release notes".length);
});

test("a title never keeps a line break", () => {
  expect(singleLine("Cat\nDog")).toBe("Cat Dog");
  expect(singleLine("Cat \r\n\n Dog.png")).toBe("Cat Dog.png");
  expect(singleLine("Plain title")).toBe("Plain title");
});
