use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const UPDATE_CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const UPDATE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Serialize)]
pub struct AvailableUpdate {
    version: String,
}

fn updater_commands_enabled() -> bool {
    !cfg!(debug_assertions)
}

#[derive(Debug, PartialEq, Eq)]
enum UpdateInstallDecision {
    Download,
    Refresh(String),
}

fn decide_update_install(expected: &str, latest: &str) -> UpdateInstallDecision {
    if expected == latest {
        UpdateInstallDecision::Download
    } else {
        UpdateInstallDecision::Refresh(latest.to_owned())
    }
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) -> Result<Option<AvailableUpdate>, String> {
    if !updater_commands_enabled() {
        return Ok(None);
    }

    let update = app
        .updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;

    Ok(update.map(|update| AvailableUpdate {
        version: update.version,
    }))
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    expected_version: String,
) -> Result<Option<AvailableUpdate>, String> {
    if !updater_commands_enabled() {
        return Err("Update installation is only available in packaged builds".to_owned());
    }

    let Some(update) = app
        .updater_builder()
        .timeout(UPDATE_CHECK_TIMEOUT)
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };

    match decide_update_install(&expected_version, &update.version) {
        UpdateInstallDecision::Download => {}
        UpdateInstallDecision::Refresh(version) => {
            return Ok(Some(AvailableUpdate { version }));
        }
    }

    let mut update = update;
    update.timeout = Some(UPDATE_DOWNLOAD_TIMEOUT);

    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|error| error.to_string())?;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::{decide_update_install, updater_commands_enabled, UpdateInstallDecision};

    #[test]
    fn updater_commands_are_disabled_in_debug_builds() {
        assert!(!updater_commands_enabled());
    }

    #[test]
    fn install_only_accepts_the_version_shown_to_the_user() {
        assert_eq!(
            decide_update_install("1.2.3", "1.2.3"),
            UpdateInstallDecision::Download
        );
        assert_eq!(
            decide_update_install("1.2.3", "1.2.4"),
            UpdateInstallDecision::Refresh("1.2.4".to_owned())
        );
    }
}
