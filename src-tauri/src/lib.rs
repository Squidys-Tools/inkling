mod embeddings;
mod jobs;
mod ocr;
mod pdf;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(storage::StorageState::default())
        .manage(jobs::ProcessingState::default())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            storage::initialize_storage,
            storage::list_active_items,
            storage::create_note,
            storage::create_url,
            storage::save_file,
            storage::resolve_asset_path,
            storage::update_item,
            storage::archive_item,
            storage::search_items,
            storage::search_similar_images,
            storage::list_spaces,
            storage::create_space,
            storage::update_space,
            storage::delete_space,
            storage::list_space_items,
            jobs::enqueue_ocr_job,
            jobs::get_job_status,
            jobs::count_active_jobs,
            jobs::retry_processing_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
