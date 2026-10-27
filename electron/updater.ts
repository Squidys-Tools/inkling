// The generic feed is the latest GitHub Release download directory; release publishing must place
// electron-builder's latest.yml and the NSIS installer there. Without Authenticode, updater hashes
// protect downloads over HTTPS but cannot establish publisher trust, and Windows may show SmartScreen.
type AvailableUpdate = { version: string };

type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{
    isUpdateAvailable?: boolean;
    updateInfo?: { version?: string };
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
};

export function createUpdateController({
  autoUpdater,
  isPackaged,
  platform,
}: {
  autoUpdater: UpdaterLike;
  isPackaged: boolean;
  platform: NodeJS.Platform;
}) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let availableUpdate: AvailableUpdate | null = null;

  async function checkForUpdates(): Promise<AvailableUpdate | null> {
    if (!isPackaged || platform !== "win32") return null;

    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable || !result.updateInfo?.version) {
      availableUpdate = null;
      return null;
    }

    availableUpdate = { version: result.updateInfo.version };
    return availableUpdate;
  }

  async function installUpdate(expectedVersion: unknown) {
    if (!isPackaged || platform !== "win32") return null;
    if (typeof expectedVersion !== "string" || availableUpdate?.version !== expectedVersion) {
      throw new Error("No matching update is available.");
    }

    const refreshedUpdate = await checkForUpdates();
    if (refreshedUpdate?.version !== expectedVersion) return refreshedUpdate;

    await autoUpdater.downloadUpdate();
    autoUpdater.quitAndInstall();
    return refreshedUpdate;
  }

  return { checkForUpdates, installUpdate };
}
