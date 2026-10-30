import { Schema } from "effect";

export type StoredLibraryItem = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  body?: string | null;
  bodyFormat?: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  localAssetPath: string | null;
  thumbnailPath: string | null;
  palette?: string[];
  ocrText: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export type StoredLibraryItemDetail = Omit<StoredLibraryItem, "body" | "bodyFormat"> & {
  body: string;
  bodyFormat: string;
};

export type StoredLibraryCard = Omit<
  StoredLibraryItem,
  "body" | "bodyFormat" | "metadata" | "updatedAt"
> & {
  metadata: {
    tags?: unknown;
    social?: unknown;
    imageUrls?: unknown;
    imageDimensions?: unknown;
    mediaWidth?: unknown;
    mediaHeight?: unknown;
    mediaAspectRatio?: unknown;
    pdfPageCount?: unknown;
    durationSeconds?: unknown;
    fileSizeBytes?: unknown;
    readingMinutes?: unknown;
  };
  hasArticleContent: boolean;
};

export type StoredItemContent = { id: string; body: string; bodyFormat: string };

export type AvailableUpdate = { version: string };
export const UpdateChannel = Schema.Literals(["latest", "nightly"]);
export type UpdateChannel = typeof UpdateChannel.Type;
export type UpdateState = {
  channel: UpdateChannel;
  currentVersion: string;
  status:
    | "disabled"
    | "idle"
    | "checking"
    | "up-to-date"
    | "available"
    | "downloading"
    | "downloaded"
    | "installing"
    | "cancelled"
    | "error";
  availableVersion: string | null;
  downloadedVersion: string | null;
  progress: number | null;
  message: string | null;
  errorContext: "check" | "download" | "install" | null;
};

export type ProcessingJobKind = "ocr_image" | "ocr_pdf_page" | "generate_embedding" | "enrich_url";
export type ProcessingJobStatus = "pending" | "processing" | "completed" | "failed";

export type ProcessingJob = {
  id: string;
  itemId: string;
  kind: ProcessingJobKind;
  status: ProcessingJobStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  progressCurrent: number;
  progressTotal: number | null;
  progressMessage: string | null;
};

export type SmartSpaceQuery = { text?: string | null; kind?: string | null; tag?: string | null };

/** A "smart" Space re-runs its saved query; a "regular" Space holds the items
 *  the user filed into it. Fixed at creation. */
export const SpaceKind = Schema.Literals(["smart", "regular"]);
export type SpaceKind = typeof SpaceKind.Type;
export const SpaceColor = Schema.Literals(["blue", "orange", "green", "pink", "purple", "yellow"]);
export type SpaceColor = typeof SpaceColor.Type;

export type StoredSpace = {
  id: string;
  name: string;
  color: SpaceColor;
  query: SmartSpaceQuery;
  kind: SpaceKind;
  position: number;
  createdAt: number;
  updatedAt: number;
  /** How many items the Space holds, when the core reports it. The sidebar shows it when present. */
  itemCount?: number;
};

export type StorageStatus = { databasePath: string; fts5Enabled: boolean; schemaVersion: number };
export type LibrarySize = { bytes: number };
export type LastExport = { exportedAt: number; items: number };

export type LibraryExportReport = {
  directory: string;
  items: number;
  archivedItems: number;
  spaces: number;
  assetFiles: number;
  skippedAssets: number;
  databaseBytes: number;
  assetsBytes: number;
};

export type LibraryImportReport = {
  importedItems: number;
  skippedDuplicateItems: number;
  importedSpaces: number;
  skippedDuplicateSpaces: number;
  assetFiles: number;
  unverifiedAssetFiles: number;
};

export type CaptureStatus = { running: boolean; port: number | null; healthUrl: string | null };
