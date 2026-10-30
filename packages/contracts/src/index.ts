import { Schema } from "effect";
import type { CommandName } from "./commands.ts";

export type { CommandName } from "./commands.ts";

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

// Argument schemas check shape only. Storage keeps the semantic checks (empty
// text, URL schemes, byte limits) so its messages stay the ones users see.
const Text = Schema.String;
const OptionalText = Schema.optional(Schema.String);
const NullableText = Schema.optional(Schema.NullOr(Schema.String));
const Limit = Schema.optional(Schema.Number);
const Metadata = Schema.Record(Schema.String, Schema.Unknown);
const SpaceQuery = Schema.Struct({ text: NullableText, kind: NullableText, tag: NullableText });
const None = Schema.Struct({});
const ById = Schema.Struct({ id: Text });
const ByItemId = Schema.Struct({ itemId: Text });
const SimilarTo = Schema.Struct({ itemId: Text, limit: Limit });
const SpaceMembership = Schema.Struct({ spaceId: Text, itemId: Text });

export const CreateNoteInput = Schema.Struct({
  title: OptionalText,
  body: Text,
  metadata: Schema.optional(Metadata),
});

export const CreateQuoteInput = Schema.Struct({
  body: Text,
  attribution: OptionalText,
  sourceUrl: OptionalText,
  metadata: Schema.optional(Metadata),
});

export const CaptureUrlInput = Schema.Struct({
  sourceUrl: Text,
  captureSource: OptionalText,
  title: OptionalText,
});

export const SaveFileInput = Schema.Struct({
  fileName: Text,
  mimeType: NullableText,
  kind: NullableText,
  // Structured clone moves a typed array as one block across IPC; storage
  // refuses anything else, such as a number array, with its own message.
  bytes: Schema.Unknown,
});

export const UpdateItemInput = Schema.Struct({
  id: Text,
  title: OptionalText,
  description: OptionalText,
  body: OptionalText,
  bodyFormat: OptionalText,
  sourceUrl: OptionalText,
  sourceLabel: OptionalText,
  localAssetPath: OptionalText,
  thumbnailPath: OptionalText,
  metadata: Schema.optional(Metadata),
  metadataPatch: Schema.optional(Metadata),
  addTag: OptionalText,
});

export const CreateSpaceInput = Schema.Struct({
  name: Text,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  kind: Schema.optional(SpaceKind),
});

export const UpdateSpaceInput = Schema.Struct({
  id: Text,
  name: OptionalText,
  color: Schema.optional(SpaceColor),
  query: Schema.optional(SpaceQuery),
  position: Schema.optional(Schema.Number),
});

export type CreateNoteInput = typeof CreateNoteInput.Type;
export type CreateQuoteInput = typeof CreateQuoteInput.Type;
export type CaptureUrlInput = typeof CaptureUrlInput.Type;
export type SaveFileInput = typeof SaveFileInput.Type;
export type UpdateItemInput = typeof UpdateItemInput.Type;
export type CreateSpaceInput = typeof CreateSpaceInput.Type;
export type UpdateSpaceInput = typeof UpdateSpaceInput.Type;

export const commandArgs = {
  check_for_updates: None,
  install_update: Schema.Struct({ expectedVersion: Text }),
  get_update_state: None,
  set_update_channel: Schema.Struct({ channel: UpdateChannel }),
  download_update: Schema.Struct({ expectedVersion: Text }),
  cancel_update_download: None,
  initialize_storage: None,
  get_app_version: None,
  get_library_size: Schema.Struct({ refresh: Schema.optional(Schema.Boolean) }),
  get_last_export: None,
  show_library_folder: None,
  show_item_in_folder: ById,
  list_active_items: None,
  list_archived_items: None,
  get_item: ById,
  get_item_cards: Schema.Struct({ ids: Schema.Array(Text) }),
  get_change_count: None,
  get_item_content: ById,
  search_items: Schema.Struct({ query: Text, limit: Limit }),
  search_similar_images: SimilarTo,
  search_similar_text: SimilarTo,
  list_spaces: None,
  create_space: Schema.Struct({ input: CreateSpaceInput }),
  delete_space: ById,
  update_space: Schema.Struct({ input: UpdateSpaceInput }),
  swap_space_positions: Schema.Struct({ firstId: Text, secondId: Text }),
  list_space_items: Schema.Struct({ id: Text, limit: Limit }),
  add_space_item: SpaceMembership,
  remove_space_item: SpaceMembership,
  list_item_spaces: ByItemId,
  create_note: Schema.Struct({ input: CreateNoteInput }),
  create_quote: Schema.Struct({ input: CreateQuoteInput }),
  capture_url: Schema.Struct({ input: CaptureUrlInput }),
  save_file: Schema.Struct({ input: SaveFileInput }),
  resolve_asset_path: Schema.Struct({ path: Text }),
  update_item: Schema.Struct({ input: UpdateItemInput }),
  archive_item: Schema.Struct({ id: Text, archived: Schema.optional(Schema.Boolean) }),
  delete_item: ById,
  export_library: Schema.Struct({
    destination: Text,
    timezoneOffsetMinutes: Schema.optional(Schema.Number),
  }),
  import_library: Schema.Struct({ exportDirectory: Text }),
  get_jobs_for_items: Schema.Struct({ itemIds: Schema.Array(Text) }),
  count_active_jobs: None,
  get_onboarding_state: None,
  complete_onboarding: None,
  enqueue_ocr_job: ByItemId,
  retry_processing_job: Schema.Struct({ jobId: Text }),
  get_capture_status: None,
  get_pairing_token: None,
  regenerate_pairing_token: None,
  select_library_directory: Schema.Struct({ title: Text }),
  "plugin:deep-link|get_current": None,
} satisfies Record<CommandName, Schema.Top>;

export type CommandArgs<C extends CommandName> = (typeof commandArgs)[C]["Type"];

export type CommandResults = {
  check_for_updates: AvailableUpdate | null;
  install_update: UpdateState;
  get_update_state: UpdateState;
  set_update_channel: UpdateState;
  download_update: UpdateState;
  cancel_update_download: UpdateState;
  initialize_storage: StorageStatus;
  get_app_version: string;
  get_library_size: LibrarySize;
  get_last_export: LastExport | null;
  show_library_folder: boolean;
  show_item_in_folder: boolean;
  list_active_items: StoredLibraryCard[];
  list_archived_items: StoredLibraryCard[];
  get_item: StoredLibraryItemDetail | null;
  get_item_cards: StoredLibraryCard[];
  get_change_count: number;
  get_item_content: StoredItemContent;
  search_items: StoredLibraryCard[];
  search_similar_images: StoredLibraryCard[];
  search_similar_text: StoredLibraryCard[];
  list_spaces: StoredSpace[];
  create_space: StoredSpace;
  delete_space: undefined;
  update_space: StoredSpace;
  swap_space_positions: StoredSpace[];
  list_space_items: StoredLibraryCard[];
  add_space_item: undefined;
  remove_space_item: undefined;
  list_item_spaces: string[];
  create_note: StoredLibraryItemDetail;
  create_quote: StoredLibraryItemDetail;
  capture_url: StoredLibraryItemDetail;
  save_file: StoredLibraryItemDetail;
  resolve_asset_path: string;
  update_item: StoredLibraryItemDetail;
  archive_item: StoredLibraryItemDetail;
  delete_item: undefined;
  export_library: LibraryExportReport;
  import_library: LibraryImportReport;
  get_jobs_for_items: ProcessingJob[];
  count_active_jobs: number;
  get_onboarding_state: { shouldAutoShow: boolean };
  complete_onboarding: undefined;
  enqueue_ocr_job: string;
  retry_processing_job: boolean;
  get_capture_status: CaptureStatus;
  get_pairing_token: string;
  regenerate_pairing_token: string;
  select_library_directory: string | null;
  // The renderer validates each link itself before it acts on one.
  "plugin:deep-link|get_current": unknown[];
};
