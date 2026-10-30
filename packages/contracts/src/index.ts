import { Schema } from "effect";
import type { CommandName } from "./commands.ts";
import {
  CaptureUrlInput,
  CreateNoteInput,
  CreateQuoteInput,
  CreateSpaceInput,
  SaveFileInput,
  UpdateItemInput,
  UpdateSpaceInput,
} from "./inputs.ts";
import {
  type AvailableUpdate,
  type CaptureStatus,
  type LastExport,
  type LibraryExportReport,
  type LibraryImportReport,
  type LibrarySize,
  type ProcessingJob,
  type SearchAnnotation,
  type SearchReply,
  type SearchProgress,
  type StorageStatus,
  type StoredItemContent,
  type StoredLibraryCard,
  type StoredLibraryItemDetail,
  type StoredSpace,
  UpdateChannel,
  type UpdateState,
} from "./models.ts";

export type { CommandName } from "./commands.ts";
export * from "./inputs.ts";
export * from "./models.ts";

const Text = Schema.String;
const Limit = Schema.optional(Schema.Number);
const None = Schema.Struct({});
const ById = Schema.Struct({ id: Text });
const ByItemId = Schema.Struct({ itemId: Text });
const SimilarTo = Schema.Struct({ itemId: Text, limit: Limit });
const SpaceMembership = Schema.Struct({ spaceId: Text, itemId: Text });

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
  search_items_detailed: Schema.Struct({
    query: Text,
    limit: Limit,
    lexicalOnly: Schema.optional(Schema.Boolean),
  }),
  get_search_annotation: ById,
  remove_search_tag: Schema.Struct({ id: Text, tag: Text }),
  get_search_progress: None,
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
  search_items_detailed: SearchReply;
  get_search_annotation: SearchAnnotation | null;
  remove_search_tag: SearchAnnotation | null;
  get_search_progress: SearchProgress;
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
