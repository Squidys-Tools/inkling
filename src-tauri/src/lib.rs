mod capture_server;
mod embeddings;
mod jobs;
mod ocr;
pub(crate) mod pdf;
mod storage;

use tauri::Manager;
use tauri_plugin_decorum::WebviewWindowExt;
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;

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
    let mut builder = tauri::Builder::default();
    // Always registered: the default capability grants mcp-bridge:default,
    // and an unregistered permission can break release startup.
    builder = builder.plugin(tauri_plugin_mcp_bridge::init());

    builder
        .manage(storage::StorageState::default())
        .manage(jobs::ProcessingState::default())
        .manage(capture_server::CaptureServerState::default())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // Register inkling:// with the OS pointing at this exe. Installer
            // builds do this via NSIS; a dev build never installs, so without
            // this the extension's deep-link tab has no protocol handler.
            #[cfg(desktop)]
            if let Err(error) = app.deep_link().register_all() {
                eprintln!("deep-link registration failed: {error}");
            }
            // Replaces the native titlebar with an overlay: the webview fills
            // the window and decorum injects a drag strip plus window controls.
            app.get_webview_window("main")
                .expect("main window must be defined in tauri.conf.json")
                .create_overlay_titlebar()?;
            // Hand the background job worker an app handle so it can push
            // job events instead of making the frontend poll for them.
            app.state::<jobs::ProcessingState>()
                .set_app_handle(app.handle().clone());
            // Loopback receiver for the browser extension: ephemeral 127.0.0.1
            // port, per-install bearer token. Never blocks boot on failure.
            capture_server::start_capture_server(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::initialize_storage,
            storage::list_active_items,
            storage::list_archived_items,
            storage::create_note,
            storage::create_quote,
            storage::create_url,
            storage::save_file,
            storage::resolve_asset_path,
            storage::update_item,
            storage::archive_item,
            storage::delete_item,
            storage::search_items,
            storage::search_similar_images,
            storage::search_similar_text,
            storage::list_spaces,
            storage::create_space,
            storage::update_space,
            storage::delete_space,
            storage::swap_space_positions,
            storage::list_space_items,
            jobs::enqueue_ocr_job,
            jobs::get_job_status,
            jobs::get_jobs_for_items,
            jobs::count_active_jobs,
            jobs::retry_processing_job,
            capture_server::get_capture_status,
            capture_server::get_pairing_token,
            capture_server::regenerate_pairing_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
