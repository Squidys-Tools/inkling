import { parseDeepLinkCapture, validateDeepLinkCapture } from "./deepLink";
import type { DeepLinkCapture } from "./deepLink";

type StoredItemKind = "note" | "article" | "image" | "pdf" | "video" | "file" | "embed";

export type StoredLibraryItem = {
  id: string;
  kind: StoredItemKind | string;
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
  favorite: boolean;
};

export type StoredLibraryItemDetail = Omit<StoredLibraryItem, "body" | "bodyFormat"> & {
  body: string;
  bodyFormat: string;
};

export type StoredLibraryCard = Omit<
  StoredLibraryItem,
  "body" | "bodyFormat" | "metadata" | "ocrText" | "updatedAt"
> & {
  ocrText: string;
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

export type StoredItemContent = {
  id: string;
  body: string;
  bodyFormat: string;
};

export type AvailableUpdate = {
  version: string;
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

export type CaptureUrlItemInput = {
  sourceUrl: string;
  captureSource: string;
  title?: string;
};

type UpdateItemInput = {
  id: string;
  title?: string;
  description?: string;
  body?: string;
  bodyFormat?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  localAssetPath?: string;
  thumbnailPath?: string;
  metadata?: StoredLibraryItem["metadata"];
  metadataPatch?: StoredLibraryItem["metadata"];
  favorite?: boolean;
  addTag?: string;
};

export type SaveFileInput = {
  fileName: string;
  mimeType: string;
  kind: "image" | "pdf" | "video" | "other";
  bytes: number[];
};

type ProcessingJobKind = "ocr_image" | "ocr_pdf_page" | "generate_embedding" | "enrich_url";
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
  hasOcrJob: boolean;
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

/** A "smart" Space re-runs its saved query; a "regular" Space holds the items
 *  the user filed into it. Fixed at creation. */
export type SpaceKind = "smart" | "regular";
export type SpaceColor = "blue" | "orange" | "green" | "pink" | "purple" | "yellow";

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

export type CreateSpaceInput = {
  name: string;
  color?: SpaceColor;
  query?: SmartSpaceQuery;
  kind?: SpaceKind;
};

export type UpdateSpaceInput = {
  id: string;
  name?: string;
  color?: SpaceColor;
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
  const activeJobs = latestJobs.filter(
    (job) => job.status === "pending" || job.status === "processing",
  );
  const completed = latestJobs.filter((job) => job.status === "completed").length;
  const progressTotal = latestJobs.reduce<number | null>((total, job) => {
    if (job.progressTotal == null) return total;
    return (total ?? 0) + job.progressTotal;
  }, null);
  const progressCurrent = latestJobs.reduce((current, job) => current + job.progressCurrent, 0);

  return {
    active: activeJobs.length > 0,
    hasOcrJob: latestJobs.some((job) => job.kind === "ocr_image" || job.kind === "ocr_pdf_page"),
    completed,
    total: latestJobs.length,
    progressCurrent,
    progressTotal,
    message: activeJobs.find((job) => job.progressMessage)?.progressMessage ?? null,
    failedJob,
  };
}

export function isElectronRuntime() {
  return typeof window !== "undefined" && Boolean(window.inkling);
}

export function isDesktopRuntime() {
  return isElectronRuntime();
}

function invoke<T>(command: string, args?: Record<string, unknown>) {
  const commands = typeof window === "undefined" ? undefined : window.inkling?.commands;
  const handler = commands?.[command as keyof typeof commands];
  if (typeof handler !== "function") {
    return Promise.reject(new Error(`The Electron command "${command}" is not available.`));
  }
  return handler(args) as Promise<T>;
}

export function checkForUpdates() {
  return invoke<AvailableUpdate | null>("check_for_updates");
}

export function installUpdate(expectedVersion: string) {
  return invoke<AvailableUpdate | null>("install_update", { expectedVersion });
}

type StorageStatus = {
  databasePath: string;
  fts5Enabled: boolean;
  schemaVersion: number;
};

let storageInitialization: Promise<StorageStatus | null> | undefined;

export async function initializeStorage() {
  if (!isDesktopRuntime()) return null;
  storageInitialization ??= invoke<StorageStatus>("initialize_storage").catch((error: unknown) => {
    storageInitialization = undefined;
    throw error;
  });
  return storageInitialization;
}

export async function getAppVersion() {
  if (!isDesktopRuntime()) return undefined;
  return invoke<string>("get_app_version");
}

export type LibrarySize = { bytes: number };

export async function getLibrarySize(refresh = true) {
  if (!isDesktopRuntime()) return undefined;
  await initializeStorage();
  return invoke<LibrarySize>("get_library_size", { refresh });
}

export type LastExport = { exportedAt: number; items: number };

export async function getLastExport() {
  if (!isDesktopRuntime()) return undefined;
  await initializeStorage();
  return invoke<LastExport | null>("get_last_export");
}

export async function showLibraryFolder() {
  if (!isDesktopRuntime()) return false;
  await initializeStorage();
  return invoke<boolean>("show_library_folder");
}

export async function showItemInFolder(id: string) {
  if (!isDesktopRuntime()) return false;
  await initializeStorage();
  return invoke<boolean>("show_item_in_folder", { id });
}

async function withInitializedStorage<T>(operation: () => Promise<T>) {
  await initializeStorage();
  return operation();
}

export async function listActiveItems() {
  return invoke<StoredLibraryCard[]>("list_active_items");
}

export async function listArchivedItems() {
  return invoke<StoredLibraryCard[]>("list_archived_items");
}

export async function getItemContent(id: string) {
  return invoke<StoredItemContent>("get_item_content", { id });
}

export async function getItem(id: string) {
  return invoke<StoredLibraryItemDetail | null>("get_item", { id });
}

export async function searchItems(query: string) {
  return invoke<StoredLibraryCard[]>("search_items", { query, limit: 100 });
}

export async function searchSimilarItems(itemId: string, kind: "image" | "text") {
  return invoke<StoredLibraryCard[]>(
    kind === "image" ? "search_similar_images" : "search_similar_text",
    { itemId, limit: 12 },
  );
}

export async function listSpaces() {
  if (!isDesktopRuntime()) return [] satisfies StoredSpace[];
  return withInitializedStorage(() => invoke<StoredSpace[]>("list_spaces"));
}

export async function createSpace(input: CreateSpaceInput) {
  return withInitializedStorage(() => invoke<StoredSpace>("create_space", { input }));
}

export async function deleteSpace(id: string) {
  await withInitializedStorage(() => invoke<void>("delete_space", { id }));
}

export async function updateSpace(input: UpdateSpaceInput) {
  return withInitializedStorage(() => invoke<StoredSpace>("update_space", { input }));
}

export async function swapSpacePositions(firstId: string, secondId: string) {
  return withInitializedStorage(() =>
    invoke<StoredSpace[]>("swap_space_positions", { firstId, secondId }),
  );
}

// Smart Spaces evaluate lazily: the backend re-runs the saved query on every
// call. Regular Spaces read back the items filed into them.
export async function listSpaceItems(id: string) {
  return withInitializedStorage(() =>
    invoke<StoredLibraryCard[]>("list_space_items", { id, limit: 100 }),
  );
}

export async function addSpaceItem(spaceId: string, itemId: string) {
  await withInitializedStorage(() => invoke<void>("add_space_item", { spaceId, itemId }));
}

export async function removeSpaceItem(spaceId: string, itemId: string) {
  await withInitializedStorage(() => invoke<void>("remove_space_item", { spaceId, itemId }));
}

export async function listItemSpaces(itemId: string) {
  return withInitializedStorage(() => invoke<string[]>("list_item_spaces", { itemId }));
}

export async function createNote(input: CreateNoteInput) {
  return withInitializedStorage(() => invoke<StoredLibraryItem>("create_note", { input }));
}

export async function createQuote(input: CreateQuoteInput) {
  return withInitializedStorage(() => invoke<StoredLibraryItem>("create_quote", { input }));
}

export async function captureUrlItem(input: CaptureUrlItemInput) {
  return withInitializedStorage(() => invoke<StoredLibraryItem>("capture_url", { input }));
}

export async function saveFile(input: SaveFileInput) {
  return withInitializedStorage(() => invoke<StoredLibraryItem>("save_file", { input }));
}

export async function assetUrl(path: string | null) {
  if (!path) return undefined;
  if (isElectronRuntime()) {
    const relativePath = path.replace(/\\/g, "/");
    if (!relativePath.startsWith("assets/")) return undefined;
    const segments = relativePath.slice("assets/".length).split("/");
    if (
      segments.some(
        (segment) => !segment || segment === "." || segment === ".." || segment.includes(":"),
      )
    ) {
      return undefined;
    }
    const encodedPath = segments.map(encodeURIComponent).join("/");
    return `app://local/library-assets/${encodedPath}`;
  }
  return path;
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
  skippedAssets: number;
  databaseBytes: number;
  assetsBytes: number;
};

// Desktop only: the export needs a native folder picker and storage backend.
export async function exportLibrary(destination: string) {
  // The core has no timezone database, so the folder name gets its wall clock
  // from here: the browser's own offset at export time.
  return invoke<LibraryExportReport>("export_library", {
    destination,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
}

export async function selectLibraryDirectory(title: string) {
  if (isElectronRuntime()) {
    return invoke<string | null>("select_library_directory", { title });
  }
  return null;
}

export type LibraryImportReport = {
  importedItems: number;
  skippedDuplicateItems: number;
  importedSpaces: number;
  skippedDuplicateSpaces: number;
  assetFiles: number;
  unverifiedAssetFiles: number;
};

export async function importLibrary(exportDirectory: string) {
  return withInitializedStorage(() =>
    invoke<LibraryImportReport>("import_library", { exportDirectory }),
  );
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

export async function countActiveJobs() {
  return withInitializedStorage(() => invoke<number>("count_active_jobs"));
}

export async function getOnboardingState() {
  return withInitializedStorage(() => invoke<{ shouldAutoShow: boolean }>("get_onboarding_state"));
}

export async function completeOnboarding() {
  return withInitializedStorage(() => invoke<void>("complete_onboarding"));
}

export async function enqueueOcrJob(itemId: string) {
  return withInitializedStorage(() => invoke<string>("enqueue_ocr_job", { itemId }));
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
  if (!isDesktopRuntime()) return null;
  return invoke<CaptureStatus>("get_capture_status");
}

export async function getPairingToken() {
  return invoke<string>("get_pairing_token");
}

export async function regeneratePairingToken() {
  return invoke<string>("regenerate_pairing_token");
}

export async function currentDeepLinks() {
  if (!isDesktopRuntime()) return [] satisfies DeepLinkCapture[];
  const links = await invoke<Array<string | DeepLinkCapture> | null>(
    "plugin:deep-link|get_current",
  );
  return (links ?? [])
    .map((link) =>
      typeof link === "string" ? parseDeepLinkCapture(link) : validateDeepLinkCapture(link),
    )
    .filter((link): link is DeepLinkCapture => link !== null);
}

export function listenForDeepLinks(handler: (payload: unknown) => void) {
  if (typeof window !== "undefined" && window.inkling) {
    return window.inkling.onDeepLink(handler);
  }
  return Promise.resolve(() => {});
}

export function listenForJobUpdates(handler: (payload: { itemId: string }) => void) {
  if (typeof window !== "undefined" && window.inkling) {
    return Promise.resolve(window.inkling.onJobUpdated(handler));
  }
  return Promise.resolve(() => {});
}
