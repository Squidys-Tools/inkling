import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { createAssetUrlResolver } from "./assetUrlCache";

type StoredItemKind = "note" | "article" | "image" | "pdf" | "video" | "file" | "embed";

export type StoredLibraryItem = {
  id: string;
  kind: StoredItemKind | string;
  title: string | null;
  description: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  localAssetPath: string | null;
  thumbnailPath: string | null;
  ocrText: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  favorite: boolean;
};

export type CreateNoteInput = {
  title?: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type CreateQuoteInput = {
  body: string;
  attribution?: string;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type CreateUrlInput = {
  sourceUrl: string;
  title: string;
  description: string;
  body: string;
  metadata?: Record<string, unknown>;
};

type UpdateItemInput = {
  id: string;
  title?: string;
  description?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  localAssetPath?: string;
  thumbnailPath?: string;
  metadata?: StoredLibraryItem["metadata"];
  favorite?: boolean;
  addTag?: string;
};

export type SaveFileInput = {
  fileName: string;
  mimeType: string;
  kind: "image" | "pdf" | "video" | "other";
  bytes: number[];
};

type ProcessingJobKind = "ocr_image" | "ocr_pdf_page" | "generate_embedding";
type ProcessingJobStatus = "pending" | "processing" | "completed" | "failed";

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

export type ProcessingSummary = {
  active: boolean;
  completed: number;
  total: number;
  progressCurrent: number;
  progressTotal: number | null;
  message: string | null;
  failedJob: ProcessingJob | null;
};

export type SmartSpaceQuery = {
  text?: string | null;
  kind?: string | null;
  tag?: string | null;
  favorite?: boolean | null;
};

export type StoredSpace = {
  id: string;
  name: string;
  color: string;
  query: SmartSpaceQuery;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type CreateSpaceInput = {
  name: string;
  color?: string;
  query?: SmartSpaceQuery;
};

export type UpdateSpaceInput = {
  id: string;
  name?: string;
  color?: string;
  query?: SmartSpaceQuery;
  position?: number;
};

function latestJobsByKind(jobs: ProcessingJob[]) {
  const latest = new Map<ProcessingJobKind, ProcessingJob>();
  for (const job of jobs) {
    const previous = latest.get(job.kind);
    if (!previous || job.createdAt > previous.createdAt) latest.set(job.kind, job);
  }
  return [...latest.values()];
}

function summarizeProcessingJobs(jobs: ProcessingJob[]): ProcessingSummary {
  const latestJobs = latestJobsByKind(jobs);
  const failedJob = latestJobs.find((job) => job.status === "failed") ?? null;
  const activeJobs = latestJobs.filter((job) => job.status === "pending" || job.status === "processing");
  const completed = latestJobs.filter((job) => job.status === "completed").length;
  const progressTotal = latestJobs.reduce<number | null>((total, job) => {
    if (job.progressTotal == null) return total;
    return (total ?? 0) + job.progressTotal;
  }, null);
  const progressCurrent = latestJobs.reduce((current, job) => current + job.progressCurrent, 0);

  return {
    active: activeJobs.length > 0,
    completed,
    total: latestJobs.length,
    progressCurrent,
    progressTotal,
    message: activeJobs.find((job) => job.progressMessage)?.progressMessage ?? null,
    failedJob,
  };
}

const runtimeIsTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function isTauriRuntime() {
  return runtimeIsTauri;
}

export async function initializeStorage() {
  if (!runtimeIsTauri) return null;
  return invoke<{ databasePath: string; fts5Enabled: boolean; schemaVersion: number }>("initialize_storage");
}

export async function listActiveItems() {
  return invoke<StoredLibraryItem[]>("list_active_items");
}

export async function listArchivedItems() {
  return invoke<StoredLibraryItem[]>("list_archived_items");
}

export async function searchItems(query: string) {
  return invoke<StoredLibraryItem[]>("search_items", { query, limit: 100 });
}

export async function searchSimilarItems(itemId: string, kind: "image" | "text") {
  return invoke<StoredLibraryItem[]>(kind === "image" ? "search_similar_images" : "search_similar_text", { itemId, limit: 12 });
}

export async function listSpaces() {
  if (!runtimeIsTauri) return [] satisfies StoredSpace[];
  return invoke<StoredSpace[]>("list_spaces");
}

export async function createSpace(input: CreateSpaceInput) {
  return invoke<StoredSpace>("create_space", { input });
}

export async function deleteSpace(id: string) {
  await invoke<void>("delete_space", { id });
}

export async function updateSpace(input: UpdateSpaceInput) {
  return invoke<StoredSpace>("update_space", { input });
}

export async function swapSpacePositions(firstId: string, secondId: string) {
  return invoke<StoredSpace[]>("swap_space_positions", { firstId, secondId });
}

// Smart Spaces evaluate lazily: the backend re-runs the saved query on every call.
export async function listSpaceItems(id: string) {
  return invoke<StoredLibraryItem[]>("list_space_items", { id, limit: 100 });
}

export async function createNote(input: CreateNoteInput) {
  return invoke<StoredLibraryItem>("create_note", { input });
}

export async function createQuote(input: CreateQuoteInput) {
  return invoke<StoredLibraryItem>("create_quote", { input });
}

export async function createUrl(input: CreateUrlInput) {
  return invoke<StoredLibraryItem>("create_url", { input });
}

export async function saveFile(input: SaveFileInput) {
  return invoke<StoredLibraryItem>("save_file", { input });
}

const resolveAssetUrl = createAssetUrlResolver(async (path) => {
  const absolutePath = await invoke<string>("resolve_asset_path", { path });
  return convertFileSrc(absolutePath);
});

export async function assetUrl(path: string | null) {
  if (!path) return undefined;
  if (!runtimeIsTauri) return path;
  return resolveAssetUrl(path);
}

export async function updateItem(input: UpdateItemInput) {
  return invoke<StoredLibraryItem>("update_item", { input });
}

export async function archiveItem(id: string, archived = true) {
  return invoke<StoredLibraryItem>("archive_item", { id, archived });
}

export async function deleteItem(id: string) {
  await invoke<void>("delete_item", { id });
}

export type LibraryExportReport = {
  directory: string;
  items: number;
  archivedItems: number;
  spaces: number;
  assetFiles: number;
  databaseBytes: number;
  assetsBytes: number;
};

// Desktop only: the export needs the native folder picker and the Rust core
// that owns the database.
export async function exportLibrary(destination: string) {
  // The core has no timezone database, so the folder name gets its wall clock
  // from here: the browser's own offset at export time.
  return invoke<LibraryExportReport>("export_library", {
    destination,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
}

export function summariesFromJobs(itemIds: string[], jobs: ProcessingJob[]) {
  const grouped = new Map<string, ProcessingJob[]>();
  for (const job of jobs) {
    const group = grouped.get(job.itemId) ?? [];
    group.push(job);
    grouped.set(job.itemId, group);
  }
  return new Map(itemIds.map((id) => [id, summarizeProcessingJobs(grouped.get(id) ?? [])]));
}

export async function getProcessingSummaries(itemIds: string[]) {
  const jobs = itemIds.length
    ? await invoke<ProcessingJob[]>("get_jobs_for_items", { itemIds })
    : [];
  return summariesFromJobs(itemIds, jobs);
}

export async function retryProcessingJob(jobId: string) {
  return invoke<boolean>("retry_processing_job", { jobId });
}

export type CaptureStatus = {
  running: boolean;
  port: number | null;
  healthUrl: string | null;
};

export async function getCaptureStatus() {
  if (!runtimeIsTauri) return null;
  return invoke<CaptureStatus>("get_capture_status");
}

export async function getPairingToken() {
  return invoke<string>("get_pairing_token");
}

export async function regeneratePairingToken() {
  return invoke<string>("regenerate_pairing_token");
}

export async function currentDeepLinks() {
  if (!runtimeIsTauri) return [] satisfies string[];
  return invoke<string[] | null>("plugin:deep-link|get_current");
}
