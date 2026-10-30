import { app, type BrowserWindow, dialog } from "electron";
import electronUpdater from "electron-updater";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { installDebianUpdate, updateDisabledReason } from "./update-install.ts";
import { createUpdateController, createUpdatePreferences } from "./updater.ts";

export function createAppUpdates({
  libraryDirectory,
  isPreview,
  getWindow,
}: {
  libraryDirectory: string;
  isPreview: boolean;
  getWindow: () => BrowserWindow | undefined;
}) {
  const { autoUpdater } = electronUpdater;
  const packageTypePath = join(process.resourcesPath, "package-type");
  const packageType = existsSync(packageTypePath)
    ? readFileSync(packageTypePath, "utf8").trim()
    : undefined;
  return createUpdateController({
    autoUpdater,
    currentVersion: app.getVersion(),
    disabledReason: updateDisabledReason({
      isPackaged: app.isPackaged,
      isPreview,
      hasFeed: existsSync(join(process.resourcesPath, "app-update.yml")),
      platform: process.platform,
      appImage: process.env.APPIMAGE,
      packageType,
    }),
    preferences: createUpdatePreferences(join(libraryDirectory, "updates.json")),
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
}
