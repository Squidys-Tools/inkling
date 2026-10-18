import type { DeepLinkCapture } from "./lib/deepLink";

type ElectronCommand =
  | "check_for_updates"
  | "install_update"
  | "initialize_storage"
  | "list_active_items"
  | "list_archived_items"
  | "get_item"
  | "get_item_content"
  | "search_items"
  | "search_similar_images"
  | "search_similar_text"
  | "list_spaces"
  | "create_space"
  | "delete_space"
  | "update_space"
  | "swap_space_positions"
  | "list_space_items"
  | "add_space_item"
  | "remove_space_item"
  | "list_item_spaces"
  | "create_note"
  | "create_quote"
  | "capture_url"
  | "save_file"
  | "resolve_asset_path"
  | "update_item"
  | "archive_item"
  | "delete_item"
  | "export_library"
  | "import_library"
  | "get_jobs_for_items"
  | "count_active_jobs"
  | "enqueue_ocr_job"
  | "retry_processing_job"
  | "get_capture_status"
  | "get_pairing_token"
  | "regenerate_pairing_token"
  | "select_library_directory"
  | "plugin:deep-link|get_current";

type ElectronBridge = {
  commands: Record<ElectronCommand, (args?: Record<string, unknown>) => Promise<unknown>>;
  onDeepLink: (listener: (captures: DeepLinkCapture[]) => void) => Promise<() => void>;
  onJobUpdated: (listener: (payload: { itemId: string }) => void) => () => void;
  windowControls: {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
  };
};

declare global {
  interface Window {
    inkling?: ElectronBridge;
  }
}

export {};
