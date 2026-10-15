// The generic feed is the latest GitHub Release download directory; release publishing must place
// electron-builder's latest.yml and the NSIS installer there. Without Authenticode, updater hashes
// protect downloads over HTTPS but cannot establish publisher trust, and Windows may show SmartScreen.
export function createUpdateController({ autoUpdater, isPackaged, platform }) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let availableUpdate = null;

  async function checkForUpdates() {
    if (!isPackaged || platform !== "win32") return null;

    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable || !result.updateInfo?.version) {
      availableUpdate = null;
      return null;
    }

    availableUpdate = { version: result.updateInfo.version };
    return availableUpdate;
  }

  async function installUpdate(expectedVersion) {
    if (!isPackaged || platform !== "win32") return null;
    if (typeof expectedVersion !== "string" || availableUpdate?.version !== expectedVersion) {
      throw new Error("No matching update is available.");
    }

    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
    return availableUpdate;
  }

  return { checkForUpdates, installUpdate };
}
