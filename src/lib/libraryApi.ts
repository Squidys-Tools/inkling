import { parseDeepLinkCapture, validateDeepLinkCapture } from "./deepLink";
import type { DeepLinkCapture } from "./deepLink";
import type {
  CommandArgs,
  CommandName,
  CommandResults,
  CreateNoteInput,
  CreateQuoteInput,
  CreateSpaceInput,
  ProcessingJob,
  ProcessingJobKind,
  StorageStatus,
  StoredSpace,
  UpdateChannel,
  UpdateItemInput,
  UpdateSpaceInput,
} from "@inkling/contracts";

export type {
  AvailableUpdate,
  CaptureStatus,
  CreateNoteInput,
  CreateQuoteInput,
  CreateSpaceInput,
  LastExport,
  LibraryExportReport,
  LibraryImportReport,
  LibrarySize,
  ProcessingJob,
  SmartSpaceQuery,
  SpaceColor,
  SpaceKind,
  StoredLibraryCard,
  StoredLibraryItem,
  StoredLibraryItemDetail,
  StoredSpace,
  UpdateChannel,
  UpdateState,
  UpdateSpaceInput,
} from "@inkling/contracts";

export type CaptureUrlItemInput = {
  sourceUrl: string;
  captureSource: string;
  title?: string;
};

export type SaveFileInput = {
  fileName: string;
  mimeType: string;
  kind: "image" | "pdf" | "video" | "other";
  // Structured clone moves a typed array as one block across IPC; a number
  // array would be several times larger and slow to copy.
  bytes: Uint8Array;
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

function invoke<C extends CommandName>(command: C, args?: CommandArgs<C>) {
  const commands = typeof window === "undefined" ? undefined : window.inkling?.commands;
  const handler = commands?.[command] as
    | ((args?: CommandArgs<C>) => Promise<CommandResults[C]>)
    | undefined;
  if (typeof handler !== "function") {
    return Promise.reject(new Error(`The Electron command "${command}" is not available.`));
  }
  return handler(args);
}

export function getScreenshotImportState() {
  return invoke("get_screenshot_import_state", {});
}

export function setScreenshotImportEnabled(enabled: boolean) {
  return invoke("set_screenshot_import_enabled", { enabled });
}

export function chooseScreenshotImportDirectory() {
  return invoke("choose_screenshot_import_directory", {});
}

export function getUpdateState() {
  return invoke("get_update_state", {});
}

export function setUpdateChannel(channel: UpdateChannel) {
  return invoke("set_update_channel", { channel });
}

export function checkForUpdates() {
  return invoke("check_for_updates", {});
}

export function downloadUpdate(expectedVersion: string) {
  return invoke("download_update", { expectedVersion });
}

export function cancelUpdateDownload() {
  return invoke("cancel_update_download", {});
}

export function installUpdate(expectedVersion: string) {
  return invoke("install_update", { expectedVersion });
}

let storageInitialization: Promise<StorageStatus | null> | undefined;

export async function initializeStorage() {
  if (!isDesktopRuntime()) return null;
  storageInitialization ??= invoke("initialize_storage").catch((error: unknown) => {
    storageInitialization = undefined;
    throw error;
  });
  return storageInitialization;
}

export async function getAppVersion() {
  if (!isDesktopRuntime()) return undefined;
  return invoke("get_app_version");
}

export async function getLibrarySize(refresh = false) {
  if (!isDesktopRuntime()) return undefined;
  await initializeStorage();
  return invoke("get_library_size", { refresh });
}

export async function getLastExport() {
  if (!isDesktopRuntime()) return undefined;
  await initializeStorage();
  return invoke("get_last_export");
}

export async function showLibraryFolder() {
  if (!isDesktopRuntime()) return false;
  await initializeStorage();
  return invoke("show_library_folder");
}

export async function showItemInFolder(id: string) {
  if (!isDesktopRuntime()) return false;
  await initializeStorage();
  return invoke("show_item_in_folder", { id });
}

async function withInitializedStorage<T>(operation: () => Promise<T>) {
  await initializeStorage();
  return operation();
}

export async function listActiveItems() {
  return invoke("list_active_items");
}

export async function listArchivedItems() {
  return invoke("list_archived_items");
}

export async function getItemContent(id: string) {
  return invoke("get_item_content", { id });
}

export async function getItem(id: string) {
  return invoke("get_item", { id });
}

export async function getItemCards(ids: string[]) {
  return invoke("get_item_cards", { ids });
}

export async function getChangeCount() {
  return invoke("get_change_count");
}

export async function searchItems(query: string) {
  return invoke("search_items", { query, limit: 100 });
}

export async function searchSimilarItems(itemId: string, kind: "image" | "text") {
  return invoke(kind === "image" ? "search_similar_images" : "search_similar_text", {
    itemId,
    limit: 12,
  });
}

export async function listSpaces() {
  if (!isDesktopRuntime()) return [] satisfies StoredSpace[];
  return withInitializedStorage(() => invoke("list_spaces"));
}

export async function createSpace(input: CreateSpaceInput) {
  return withInitializedStorage(() => invoke("create_space", { input }));
}

export async function deleteSpace(id: string) {
  await withInitializedStorage(() => invoke("delete_space", { id }));
}

export async function updateSpace(input: UpdateSpaceInput) {
  return withInitializedStorage(() => invoke("update_space", { input }));
}

export async function swapSpacePositions(firstId: string, secondId: string) {
  return withInitializedStorage(() => invoke("swap_space_positions", { firstId, secondId }));
}

// Smart Spaces evaluate lazily: the backend re-runs the saved query on every
// call. Regular Spaces read back the items filed into them.
export async function listSpaceItems(id: string) {
  return withInitializedStorage(() => invoke("list_space_items", { id, limit: 100 }));
}

export async function addSpaceItem(spaceId: string, itemId: string) {
  await withInitializedStorage(() => invoke("add_space_item", { spaceId, itemId }));
}

export async function removeSpaceItem(spaceId: string, itemId: string) {
  await withInitializedStorage(() => invoke("remove_space_item", { spaceId, itemId }));
}

export async function listItemSpaces(itemId: string) {
  return withInitializedStorage(() => invoke("list_item_spaces", { itemId }));
}

export async function createNote(input: CreateNoteInput) {
  return withInitializedStorage(() => invoke("create_note", { input }));
}

export async function createQuote(input: CreateQuoteInput) {
  return withInitializedStorage(() => invoke("create_quote", { input }));
}

export async function captureUrlItem(input: CaptureUrlItemInput) {
  return withInitializedStorage(() => invoke("capture_url", { input }));
}

export async function saveFile(input: SaveFileInput) {
  return withInitializedStorage(() => invoke("save_file", { input }));
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
  return invoke("update_item", { input });
}

export async function archiveItem(id: string, archived = true) {
  return invoke("archive_item", { id, archived });
}

export async function deleteItem(id: string) {
  await invoke("delete_item", { id });
}

// Desktop only: the export needs a native folder picker and storage backend.
export async function exportLibrary(destination: string) {
  // The core has no timezone database, so the folder name gets its wall clock
  // from here: the browser's own offset at export time.
  return invoke("export_library", {
    destination,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
  });
}

export async function selectLibraryDirectory(title: string) {
  if (isElectronRuntime()) {
    return invoke("select_library_directory", { title });
  }
  return null;
}

export async function importLibrary(exportDirectory: string) {
  return withInitializedStorage(() => invoke("import_library", { exportDirectory }));
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
  const jobs = itemIds.length ? await invoke("get_jobs_for_items", { itemIds }) : [];
  return summariesFromJobs(itemIds, jobs);
}

export async function countActiveJobs() {
  return withInitializedStorage(() => invoke("count_active_jobs"));
}

export async function getOnboardingState() {
  return withInitializedStorage(() => invoke("get_onboarding_state"));
}

export async function completeOnboarding() {
  return withInitializedStorage(() => invoke("complete_onboarding"));
}

export async function enqueueOcrJob(itemId: string) {
  return withInitializedStorage(() => invoke("enqueue_ocr_job", { itemId }));
}

export async function retryProcessingJob(jobId: string) {
  return invoke("retry_processing_job", { jobId });
}

export async function getCaptureStatus() {
  if (!isDesktopRuntime()) return null;
  return invoke("get_capture_status");
}

export async function getPairingToken() {
  return invoke("get_pairing_token");
}

export async function regeneratePairingToken() {
  return invoke("regenerate_pairing_token");
}

export async function currentDeepLinks() {
  if (!isDesktopRuntime()) return [] satisfies DeepLinkCapture[];
  const links = await invoke("plugin:deep-link|get_current");
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
