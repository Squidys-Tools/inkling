import type { UpdateChannel, UpdateState } from "@inkling/contracts/desktop";
import { app } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createUpdateController, createUpdatePreferences } from "./controller.ts";
import { installDebianUpdate, updateDisabledReason } from "./install.ts";

/**
 * The `updates.*` bridge calls. electron-updater loads on the first one, which
 * the sidebar makes once per launch with a check. Nothing downloads or installs
 * unless the user asks.
 */
export function appUpdates({
  libraryDirectory,
  onChange,
}: {
  libraryDirectory: string;
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
      localBuild: !app.isPackaged,
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
        if (process.platform === "linux" && packageType === "deb") {
          await installDebianUpdate(file, version, sha512);
          app.relaunch();
          app.quit();
        } else {
          // Silent, so updates never flash the installer's progress window.
          autoUpdater.quitAndInstall(true, true);
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
    // Download acts on the version the window was shown, and install on the one the user
    // confirmed; the controller refuses either if the feed moved on since.
    download: async () => {
      const current = await updates();
      const { availableVersion } = await current.getState();
      if (!availableVersion) throw new Error("Check for updates before downloading one.");
      return current.downloadUpdate(availableVersion);
    },
    install: async (version: string) => (await updates()).installUpdate(version),
    cancel: async () => (await updates()).cancelDownload(),
    setChannel: async (channel: UpdateChannel) => (await updates()).setChannel(channel),
  };
}
