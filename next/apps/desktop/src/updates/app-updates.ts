import type { UpdateChannel, UpdateState } from "@inkling/contracts/desktop";
import { app, type BrowserWindow, dialog } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createUpdateController, createUpdatePreferences } from "./controller.ts";
import { installDebianUpdate, updateDisabledReason } from "./install.ts";

/**
 * The `updates.*` bridge calls. electron-updater loads on the first one, so a
 * launch that never opens update settings never pays for it, and nothing
 * checks, downloads or installs unless the user asks.
 */
export function appUpdates({
  libraryDirectory,
  getWindow,
  onChange,
}: {
  libraryDirectory: string;
  getWindow: () => BrowserWindow | undefined;
  onChange: (state: UpdateState) => void;
}) {
  let controller: Promise<ReturnType<typeof createUpdateController>> | undefined;
  const open = async () => {
    const { autoUpdater } = (await import("electron-updater")).default;
    const packageTypePath = join(process.resourcesPath, "package-type");
    const packageType = existsSync(packageTypePath)
      ? readFileSync(packageTypePath, "utf8").trim()
      : undefined;
    return createUpdateController({
      autoUpdater,
      currentVersion: app.getVersion(),
      disabledReason: updateDisabledReason({
        isPackaged: app.isPackaged,
        hasFeed: existsSync(join(process.resourcesPath, "app-update.yml")),
        platform: process.platform,
        appImage: process.env.APPIMAGE,
        packageType,
      }),
      preferences: createUpdatePreferences(join(libraryDirectory, "updates.json")),
      onChange,
      install: async (file, version, sha512) => {
        const window = getWindow();
        if (!window || window.isDestroyed()) throw new Error("No active app window.");
        const { response } = await dialog.showMessageBox(window, {
          type: "question",
          title: "Install inkling update",
          message: `Install inkling ${version}?`,
          detail:
            "inkling will restart after installation. Debian may ask for system authorization. Your library stays on this computer.",
          buttons: ["Cancel", "Install and restart"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response !== 1) throw new Error("Update installation canceled.");
        if (process.platform === "linux" && packageType === "deb") {
          await installDebianUpdate(file, version, sha512);
          app.relaunch();
          app.quit();
        } else {
          autoUpdater.quitAndInstall(false, true);
        }
      },
    });
  };
  const updates = () => (controller ??= open());

  return {
    state: async () => (await updates()).getState(),
    check: async () => {
      const current = await updates();
      await current.checkForUpdates();
      return current.getState();
    },
    // Download and install act on the version the window was shown; the
    // controller refuses if the feed moved on since.
    download: async () => {
      const current = await updates();
      const { availableVersion } = await current.getState();
      if (!availableVersion) throw new Error("Check for updates before downloading one.");
      return current.downloadUpdate(availableVersion);
    },
    install: async () => {
      const current = await updates();
      const { downloadedVersion } = await current.getState();
      if (!downloadedVersion) throw new Error("Download this update before installing it.");
      return current.installUpdate(downloadedVersion);
    },
    cancel: async () => (await updates()).cancelDownload(),
    setChannel: async (channel: UpdateChannel) => (await updates()).setChannel(channel),
  };
}
