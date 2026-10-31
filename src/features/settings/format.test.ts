import { expect, test } from "bun:test";
import { formatExportSummary } from "./format";

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
