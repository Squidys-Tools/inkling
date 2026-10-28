import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateController, createUpdatePreferences } from "./updater.ts";
import { updateDisabledReason } from "./update-install.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "inkling-update-test-"));
  const file = join(root, "update.deb");
  await writeFile(file, "verified test payload");
  let version = "0.1.1";
  let installs = 0;
  let checks = 0;
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    allowPrerelease: true,
    channel: null as string | null,
    checkForUpdates: async () => {
      checks++;
      return { isUpdateAvailable: true, updateInfo: { version } };
    },
    downloadUpdate: async () => [file],
  });
  const options = {
    autoUpdater: updater,
    currentVersion: "0.1.0",
    preferences: createUpdatePreferences(join(root, "updates.json")),
    install: async () => {
      installs++;
    },
  };
  return {
    root,
    file,
    updater,
    options,
    controller: createUpdateController(options),
    setVersion: (v: string) => {
      version = v;
    },
    counts: () => ({ installs, checks }),
  };
}

test("explicit verified download and install are separate, persist channels and detect a non-applied install", async () => {
  const f = await fixture();
  try {
    await expect(f.controller.installUpdate("0.1.1")).rejects.toThrow("Download");
    expect(await f.controller.checkForUpdates()).toEqual({ version: "0.1.1" });
    expect(f.updater.autoDownload).toBe(false);
    expect(f.updater.autoInstallOnAppQuit).toBe(false);
    expect((await f.controller.downloadUpdate("0.1.1")).status).toBe("downloaded");
    expect(f.counts().installs).toBe(0);
    expect((await f.controller.installUpdate("0.1.1")).status).toBe("installing");
    expect(f.counts().installs).toBe(1);
    await expect(f.controller.installUpdate("0.1.1")).rejects.toThrow("already running");
    await expect(f.controller.setChannel("nightly")).rejects.toThrow("already running");
    const reopened = createUpdateController(f.options);
    expect((await reopened.getState()).message).toContain("did not apply");
    await reopened.setChannel("nightly");
    expect((await createUpdateController(f.options).getState()).channel).toBe("nightly");
    expect(f.updater.allowDowngrade).toBe(false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("rejects lower/equal versions, wrong prerelease trains and a stale or modified download", async () => {
  const f = await fixture();
  try {
    for (const version of ["0.0.9", "0.1.0", "0.2.0-nightly.20261028.1", "bad"]) {
      f.setVersion(version);
      expect(await f.controller.checkForUpdates()).toBeNull();
    }
    await f.controller.setChannel("nightly");
    for (const version of ["0.2.0", "0.2.0-beta.1", "0.1.0-nightly.1", "0.2.0-nightly.evil"]) {
      f.setVersion(version);
      expect(await f.controller.checkForUpdates()).toBeNull();
    }
    f.setVersion("0.2.0-nightly.20261028.1");
    expect(await f.controller.checkForUpdates()).not.toBeNull();
    f.setVersion("0.2.0-nightly.20261028.2");
    expect((await f.controller.downloadUpdate("0.2.0-nightly.20261028.1")).status).toBe(
      "available",
    );
    await f.controller.downloadUpdate("0.2.0-nightly.20261028.2");
    await writeFile(f.file, "tampered");
    expect((await f.controller.installUpdate("0.2.0-nightly.20261028.2")).errorContext).toBe(
      "install",
    );
    expect(f.counts().installs).toBe(0);
    await f.controller.setChannel("latest");
    await expect(f.controller.installUpdate("0.2.0-nightly.20261028.2")).rejects.toThrow(
      "Download",
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("single-flight excludes channel changes and duplicate clicks; cancellation and install failure recover", async () => {
  const f = await fixture();
  try {
    let finish!: (value: string[]) => void;
    let started!: () => void;
    const signal = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.updater.downloadUpdate = () =>
      new Promise((resolve) => {
        finish = resolve;
        started();
      });
    await f.controller.checkForUpdates();
    const pending = f.controller.downloadUpdate("0.1.1");
    await signal;
    await expect(f.controller.setChannel("nightly")).rejects.toThrow("already running");
    await expect(f.controller.downloadUpdate("0.1.1")).rejects.toThrow("already running");
    await f.controller.cancelDownload();
    finish([f.file]);
    expect((await pending).status).toBe("cancelled");
    f.updater.downloadUpdate = async () => [f.file];
    const failed = createUpdateController({
      ...f.options,
      install: async () => {
        throw new Error("PolicyKit canceled");
      },
    });
    await failed.checkForUpdates();
    await failed.downloadUpdate("0.1.1");
    expect((await failed.installUpdate("0.1.1")).errorContext).toBe("install");
    expect((await failed.setChannel("nightly")).status).toBe("idle");
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("release runtime support is explicit for NSIS/AppImage/deb and excludes previews/unpacked builds", () => {
  const options = { isPackaged: true, isPreview: false, hasFeed: true, platform: "linux" as const };
  expect(updateDisabledReason({ ...options, platform: "win32" })).toBeNull();
  expect(updateDisabledReason({ ...options, packageType: "deb" })).toBeNull();
  expect(updateDisabledReason({ ...options, appImage: "/tmp/a.AppImage" })).toBeNull();
  expect(updateDisabledReason(options)).not.toBeNull();
  expect(updateDisabledReason({ ...options, packageType: "deb", isPreview: true })).not.toBeNull();
  expect(updateDisabledReason({ ...options, platform: "win32", isPackaged: false })).not.toBeNull();
});
