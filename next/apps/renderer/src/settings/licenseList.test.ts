import { expect, test } from "bun:test";
import { filterLicenses, licenseCounts, type ThirdPartyLicense } from "./licenseList.ts";

const entry = (
  name: string,
  license: string,
  version: string | null = "1.0.0",
): ThirdPartyLicense => ({
  name,
  version,
  license,
  sourceUrl: null,
  noticeText: "",
});

const entries = [
  entry("react", "MIT"),
  entry("effect", "MIT", "4.0.6"),
  entry("sharp", "Apache-2.0"),
  entry("bloub", "MIT", null),
  entry("dompurify", "MPL-2.0 OR Apache-2.0"),
];

test("counts licenses most common first, ties by name", () => {
  expect(licenseCounts(entries)).toEqual([
    ["MIT", 3],
    ["Apache-2.0", 1],
    ["MPL-2.0 OR Apache-2.0", 1],
  ]);
});

test.each([
  ["", [], ["react", "effect", "sharp", "bloub", "dompurify"]],
  ["  REACT ", [], ["react"]],
  ["4.0", [], ["effect"]],
  // A license filter matches the whole expression, not a part of it.
  ["", ["Apache-2.0"], ["sharp"]],
  ["apache", ["MIT"], []],
  ["", ["MIT", "Apache-2.0"], ["react", "effect", "sharp", "bloub"]],
])("query %p under %p", (query, licenses, names) => {
  expect(filterLicenses(entries, query, new Set(licenses)).map((found) => found.name)).toEqual(
    names,
  );
});
