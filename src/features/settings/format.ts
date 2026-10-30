import type { LastExport, LibraryExportReport, LibraryImportReport } from "../../lib/libraryApi";

// "1 item", "3 items". Every noun counted in Settings takes a plain -s.
export function countOf(count: number, noun: string) {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function formatByteSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatExportSummary(report: LibraryExportReport) {
  const summary = `${report.items} items · ${report.assetFiles} files · ${formatByteSize(report.databaseBytes + report.assetsBytes)}`;
  if (report.skippedAssets === 0) return summary;
  return `${summary} · ${countOf(report.skippedAssets, "asset")} skipped`;
}

export function formatLastCopy(copy: LastExport) {
  const date = new Date(copy.exportedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `last copy ${date} · ${copy.items.toLocaleString()} ${copy.items === 1 ? "item" : "items"}`;
}

export function formatImportSummary(report: LibraryImportReport) {
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
