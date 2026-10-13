use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize)]
pub struct AvailableUpdate {
    version: String,
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<AvailableUpdate>, String> {
    if cfg!(debug_assertions) {
        return Ok(None);
    }

    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    Ok(update.map(|update| AvailableUpdate {
        version: update.version,
    }))
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("Update installation is only available in packaged builds".to_owned());
    }

    let update = app
        .updater()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No update is available".to_owned())?;

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart();
}
