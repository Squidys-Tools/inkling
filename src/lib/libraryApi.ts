import { convertFileSrc, invoke } from "@tauri-apps/api/core";

export type StoredItemKind = "note" | "article" | "image" | "pdf" | "video" | "file" | "embed";

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

export type CreateUrlInput = {
  sourceUrl: string;
  title: string;
  description: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type SaveFileInput = {
  fileName: string;
  mimeType: string;
  kind: "image" | "pdf" | "video" | "other";
  bytes: number[];
};

export type ProcessingJobKind = "ocr_image" | "ocr_pdf_page" | "generate_embedding";
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

export type ProcessingSummary = {
  active: boolean;
  completed: number;
  total: number;
  progressCurrent: number;
  progressTotal: number | null;
  message: string | null;
  failedJob: ProcessingJob | null;
};

function latestJobsByKind(jobs: ProcessingJob[]) {
  const latest = new Map<ProcessingJobKind, ProcessingJob>();
  for (const job of jobs) {
    const previous = latest.get(job.kind);
    if (!previous || job.createdAt > previous.createdAt) latest.set(job.kind, job);
  }
  return [...latest.values()];
}

export function summarizeProcessingJobs(jobs: ProcessingJob[]): ProcessingSummary {
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

export async function searchItems(query: string) {
  return invoke<StoredLibraryItem[]>("search_items", { query, limit: 100 });
}

export async function searchSimilarImages(itemId: string) {
  return invoke<StoredLibraryItem[]>("search_similar_images", { itemId, limit: 12 });
}

export async function createNote(input: CreateNoteInput) {
  return invoke<StoredLibraryItem>("create_note", { input });
}

export async function createUrl(input: CreateUrlInput) {
  return invoke<StoredLibraryItem>("create_url", { input });
}

export async function saveFile(input: SaveFileInput) {
  return invoke<StoredLibraryItem>("save_file", { input });
}

export async function assetUrl(path: string | null) {
  if (!path) return undefined;
  if (!runtimeIsTauri) return path;
  const absolutePath = await invoke<string>("resolve_asset_path", { path });
  return convertFileSrc(absolutePath);
}

export async function archiveItem(id: string) {
  return invoke<StoredLibraryItem>("archive_item", { id, archived: true });
}

export async function enqueueOcrJob(itemId: string) {
  return invoke<string>("enqueue_ocr_job", { itemId });
}

export async function getJobStatus(itemId: string) {
  return invoke<ProcessingJob[]>("get_job_status", { itemId });
}

export async function countActiveJobs() {
  return invoke<number>("count_active_jobs");
}

export async function retryProcessingJob(jobId: string) {
  return invoke<boolean>("retry_processing_job", { jobId });
}

export async function currentDeepLinks() {
  if (!runtimeIsTauri) return [] satisfies string[];
  return invoke<string[] | null>("plugin:deep-link|get_current");
}
