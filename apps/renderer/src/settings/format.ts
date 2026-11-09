import type { ExportReport, ImportReport, LastExport } from "@inkling/contracts";
import { dayAndMonth, formatByteSize } from "../format.ts";

// "1 item", "3 items". Every noun counted in Settings takes a plain -s.
function countOf(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function formatExportSummary(report: ExportReport) {
  const summary = `${countOf(report.items, "item")} · ${countOf(report.assetFiles, "file")} · ${formatByteSize(report.databaseBytes + report.assetsBytes)}`;
  if (report.skippedAssets === 0) return summary;
  return `${summary} · ${countOf(report.skippedAssets, "asset")} skipped`;
}

export function formatLastCopy(copy: LastExport) {
  const date = dayAndMonth(copy.exportedAt);
  return `last copy ${date} · ${copy.items.toLocaleString()} ${copy.items === 1 ? "item" : "items"}`;
}

export function formatImportSummary(report: ImportReport) {
  const summary = [
    `${countOf(report.importedItems, "item")} restored`,
    `${countOf(report.importedSpaces, "Space")} added`,
  ];
  if (report.skippedDuplicateItems > 0) {
    summary.push(`${countOf(report.skippedDuplicateItems, "existing item")} left unchanged`);
  }
  if (report.skippedDuplicateSpaces > 0) {
    summary.push(`${countOf(report.skippedDuplicateSpaces, "existing Space")} left unchanged`);
  }
  if (report.assetFiles > 0) {
    summary.push(`${countOf(report.assetFiles, "file")} copied`);
  }
  if (report.unverifiedAssetFiles > 0) {
    summary.push(
      `${countOf(report.unverifiedAssetFiles, "file")} from an older export could not be verified`,
    );
  }
  return summary.join(" · ");
}
