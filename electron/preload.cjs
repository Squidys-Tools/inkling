const { contextBridge, ipcRenderer } = require("electron");

// Never expose a generic IPC or command passthrough: the renderer is untrusted and must not get raw filesystem or shell access.
const commands = Object.freeze({
  check_for_updates: () => ipcRenderer.invoke("inkling:check_for_updates"),
  install_update: (args) => ipcRenderer.invoke("inkling:install_update", args),
  initialize_storage: () => ipcRenderer.invoke("inkling:initialize_storage"),
  get_app_version: () => ipcRenderer.invoke("inkling:get_app_version"),
  get_library_size: (args) => ipcRenderer.invoke("inkling:get_library_size", args),
  get_last_export: () => ipcRenderer.invoke("inkling:get_last_export"),
  show_library_folder: () => ipcRenderer.invoke("inkling:show_library_folder"),
  show_item_in_folder: (args) => ipcRenderer.invoke("inkling:show_item_in_folder", args),
  list_active_items: () => ipcRenderer.invoke("inkling:list_active_items"),
  list_archived_items: () => ipcRenderer.invoke("inkling:list_archived_items"),
  get_item: (args) => ipcRenderer.invoke("inkling:get_item", args),
  get_item_cards: (args) => ipcRenderer.invoke("inkling:get_item_cards", args),
  get_change_count: () => ipcRenderer.invoke("inkling:get_change_count"),
  get_item_content: (args) => ipcRenderer.invoke("inkling:get_item_content", args),
  search_items: (args) => ipcRenderer.invoke("inkling:search_items", args),
  search_similar_images: (args) => ipcRenderer.invoke("inkling:search_similar_images", args),
  search_similar_text: (args) => ipcRenderer.invoke("inkling:search_similar_text", args),
  list_spaces: () => ipcRenderer.invoke("inkling:list_spaces"),
  create_space: (args) => ipcRenderer.invoke("inkling:create_space", args),
  delete_space: (args) => ipcRenderer.invoke("inkling:delete_space", args),
  update_space: (args) => ipcRenderer.invoke("inkling:update_space", args),
  swap_space_positions: (args) => ipcRenderer.invoke("inkling:swap_space_positions", args),
  list_space_items: (args) => ipcRenderer.invoke("inkling:list_space_items", args),
  add_space_item: (args) => ipcRenderer.invoke("inkling:add_space_item", args),
  remove_space_item: (args) => ipcRenderer.invoke("inkling:remove_space_item", args),
  list_item_spaces: (args) => ipcRenderer.invoke("inkling:list_item_spaces", args),
  create_note: (args) => ipcRenderer.invoke("inkling:create_note", args),
  create_quote: (args) => ipcRenderer.invoke("inkling:create_quote", args),
  capture_url: (args) => ipcRenderer.invoke("inkling:capture_url", args),
  save_file: (args) => ipcRenderer.invoke("inkling:save_file", args),
  resolve_asset_path: (args) => ipcRenderer.invoke("inkling:resolve_asset_path", args),
  update_item: (args) => ipcRenderer.invoke("inkling:update_item", args),
  archive_item: (args) => ipcRenderer.invoke("inkling:archive_item", args),
  delete_item: (args) => ipcRenderer.invoke("inkling:delete_item", args),
  export_library: (args) => ipcRenderer.invoke("inkling:export_library", args),
  import_library: (args) => ipcRenderer.invoke("inkling:import_library", args),
  get_jobs_for_items: (args) => ipcRenderer.invoke("inkling:get_jobs_for_items", args),
  count_active_jobs: () => ipcRenderer.invoke("inkling:count_active_jobs"),
  get_onboarding_state: () => ipcRenderer.invoke("inkling:get_onboarding_state"),
  complete_onboarding: () => ipcRenderer.invoke("inkling:complete_onboarding"),
  enqueue_ocr_job: (args) => ipcRenderer.invoke("inkling:enqueue_ocr_job", args),
  retry_processing_job: (args) => ipcRenderer.invoke("inkling:retry_processing_job", args),
  get_capture_status: () => ipcRenderer.invoke("inkling:get_capture_status"),
  get_pairing_token: () => ipcRenderer.invoke("inkling:get_pairing_token"),
  regenerate_pairing_token: () => ipcRenderer.invoke("inkling:regenerate_pairing_token"),
  select_library_directory: (args) => ipcRenderer.invoke("inkling:select_library_directory", args),
  "plugin:deep-link|get_current": () => ipcRenderer.invoke("inkling:plugin:deep-link|get_current"),
});

contextBridge.exposeInMainWorld(
  "inkling",
  Object.freeze({
    commands,
    onDeepLink: async (listener) => {
      const handler = (_event, captures) => listener(captures);
      ipcRenderer.on("inkling:deep-link", handler);
      try {
        await ipcRenderer.invoke("inkling:deep-link:subscribe");
      } catch (error) {
        ipcRenderer.removeListener("inkling:deep-link", handler);
        throw error;
      }
      return () => {
        ipcRenderer.removeListener("inkling:deep-link", handler);
        void ipcRenderer.invoke("inkling:deep-link:unsubscribe");
      };
    },
    onJobUpdated: (listener) => {
      const handler = (_event, payload) => listener(payload);
      ipcRenderer.on("inkling:job-updated", handler);
      return () => ipcRenderer.removeListener("inkling:job-updated", handler);
    },
    windowControls: Object.freeze({
      minimize: () => ipcRenderer.invoke("inkling:window:minimize"),
      toggleMaximize: () => ipcRenderer.invoke("inkling:window:toggle-maximize"),
      close: () => ipcRenderer.invoke("inkling:window:close"),
      ready: () => ipcRenderer.invoke("inkling:window:ready"),
    }),
  }),
);
