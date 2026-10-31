import { expect, test } from "bun:test";
import { formatByteSize, formatExportSummary, formatImportSummary } from "./format.ts";

test.each([
  { items: 1, assetFiles: 1, skippedAssets: 0, text: "1 item · 1 file · 2.0 KB" },
  { items: 3, assetFiles: 0, skippedAssets: 0, text: "3 items · 0 files · 2.0 KB" },
  {
    items: 2,
    assetFiles: 5,
    skippedAssets: 1,
    text: "2 items · 5 files · 2.0 KB · 1 asset skipped",
  },
])("the export summary reads $text", ({ text, ...counts }) => {
  const report = {
    directory: "",
    archivedItems: 0,
    spaces: 0,
    databaseBytes: 1024,
    assetsBytes: 1024,
    ...counts,
  };
  expect(formatExportSummary(report)).toBe(text);
});

test.each([
  [1023, "1023 B"],
  [1024, "1.0 KB"],
  [10 * 1024, "10 KB"],
  [1.5 * 1024 ** 3, "1.5 GB"],
  [2048 * 1024 ** 3, "2048 GB"],
])("%p bytes read %p", (bytes, text) => {
  expect(formatByteSize(bytes)).toBe(text);
});

const nothingImported = {
  importedItems: 0,
  skippedDuplicateItems: 0,
  importedSpaces: 0,
  skippedDuplicateSpaces: 0,
  assetFiles: 0,
  unverifiedAssetFiles: 0,
};

test.each([
  [{}, "0 items restored · 0 Spaces added"],
  [
    { importedItems: 1, importedSpaces: 1, skippedDuplicateItems: 2, assetFiles: 1 },
    "1 item restored · 1 Space added · 2 existing items left unchanged · 1 file copied",
  ],
  [
    { skippedDuplicateSpaces: 1, unverifiedAssetFiles: 3 },
    "0 items restored · 0 Spaces added · 1 existing Space left unchanged · 3 files from an older export could not be verified",
  ],
])("the import summary for %o", (counts, text) => {
  expect(formatImportSummary({ ...nothingImported, ...counts })).toBe(text);
});
