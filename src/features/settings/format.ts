import type { LastExport, LibraryExportReport, LibraryImportReport } from "../../lib/libraryApi";

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
  const assets = report.skippedAssets === 1 ? "asset" : "assets";
  return `${summary} · ${report.skippedAssets} ${assets} skipped`;
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
    `${report.importedItems} ${report.importedItems === 1 ? "item" : "items"} restored`,
    `${report.importedSpaces} ${report.importedSpaces === 1 ? "Space" : "Spaces"} added`,
  ];
  if (report.skippedDuplicateItems > 0) {
    summary.push(
      `${report.skippedDuplicateItems} existing ${report.skippedDuplicateItems === 1 ? "item" : "items"} left unchanged`,
    );
  }
  if (report.skippedDuplicateSpaces > 0) {
    summary.push(
      `${report.skippedDuplicateSpaces} existing ${report.skippedDuplicateSpaces === 1 ? "Space" : "Spaces"} left unchanged`,
    );
  }
  if (report.assetFiles > 0) {
    summary.push(`${report.assetFiles} ${report.assetFiles === 1 ? "file" : "files"} copied`);
  }
  if (report.unverifiedAssetFiles > 0) {
    summary.push(
      `${report.unverifiedAssetFiles} ${report.unverifiedAssetFiles === 1 ? "file" : "files"} from an older export could not be verified`,
    );
  }
  return summary.join(" · ");
}
