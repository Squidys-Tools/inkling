mod embeddings;
mod jobs;
mod ocr;
mod pdf;
mod storage;

// ort is built with `load-dynamic`, so it loads onnxruntime.dll at runtime.
fn configure_ort_dylib() {
    if std::env::var_os("ORT_DYLIB_PATH").is_some() {
        return;
    }
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        std::env::current_exe()
            .ok()
            .map(|exe| exe.with_file_name("onnxruntime.dll")),
        Some(manifest_dir.join("onnxruntime.dll")),
    ];
    for candidate in candidates.into_iter().flatten() {
        if candidate.is_file() {
            std::env::set_var("ORT_DYLIB_PATH", candidate);
            return;
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_ort_dylib();
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
            storage::create_quote,
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
