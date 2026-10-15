import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { createUpdateController } from "./updater.mjs";

const updateInfo = JSON.parse(
  await readFile(new URL("./fixtures/latest.json", import.meta.url), "utf8"),
);

test("checks a local latest.json and installs only after an explicit request", async () => {
  const calls: string[] = [];
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    checkForUpdates: async () => {
      calls.push("check");
      return { isUpdateAvailable: true, updateInfo };
    },
    downloadUpdate: async () => {
      calls.push("download");
      return ["update.exe"];
    },
    quitAndInstall: () => calls.push("install"),
  };
  const controller = createUpdateController({ autoUpdater, isPackaged: true, platform: "win32" });

  expect(await controller.checkForUpdates()).toEqual({ version: "0.1.1" });
  expect(autoUpdater.autoDownload).toBe(false);
  expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
  expect(calls).toEqual(["check"]);

  expect(await controller.installUpdate("0.1.1")).toEqual({ version: "0.1.1" });
  expect(calls).toEqual(["check", "check", "download", "install"]);
});

test("does not check the feed outside a packaged Windows build", async () => {
  let checks = 0;
  const controller = createUpdateController({
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => {
        checks += 1;
        return null;
      },
      downloadUpdate: async () => [],
      quitAndInstall: () => {},
    },
    isPackaged: true,
    platform: "linux",
  });

  expect(await controller.checkForUpdates()).toBeNull();
  expect(checks).toBe(0);
});

test("does not check the feed in an unpackaged Windows build", async () => {
  let checks = 0;
  const controller = createUpdateController({
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => {
        checks += 1;
        return null;
      },
      downloadUpdate: async () => [],
      quitAndInstall: () => {},
    },
    isPackaged: false,
    platform: "win32",
  });

  expect(await controller.checkForUpdates()).toBeNull();
  expect(checks).toBe(0);
});

test("refreshes the feed and skips a stale update before downloading", async () => {
  let checks = 0;
  const calls: string[] = [];
  const controller = createUpdateController({
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => {
        calls.push("check");
        checks += 1;
        const refreshedInfo = { ...updateInfo, version: checks === 1 ? "0.1.1" : "0.1.2" };
        return { isUpdateAvailable: true, updateInfo: refreshedInfo };
      },
      downloadUpdate: async () => {
        calls.push("download");
        return [];
      },
      quitAndInstall: () => calls.push("install"),
    },
    isPackaged: true,
    platform: "win32",
  });

  expect(await controller.checkForUpdates()).toEqual({ version: "0.1.1" });
  expect(await controller.installUpdate("0.1.1")).toEqual({ version: "0.1.2" });
  expect(calls).toEqual(["check", "check"]);
});

test("refuses to install a version that was not checked", async () => {
  const controller = createUpdateController({
    autoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo }),
      downloadUpdate: async () => [],
      quitAndInstall: () => {},
    },
    isPackaged: true,
    platform: "win32",
  });

  await expect(controller.installUpdate("0.1.1")).rejects.toThrow(
    "No matching update is available",
  );
});
