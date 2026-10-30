import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateController, createUpdatePreferences } from "./updater.ts";

const nightly = "0.2.0-nightly.20261030.1";

test("Stable and Nightly survive controller restart without automatic checks, downloads, installs or downgrade", async () => {
  const root = await mkdtemp(join(tmpdir(), "inkling-nightly-channel-"));
  const preferences = createUpdatePreferences(join(root, "updates.json"));
  const calls: string[] = [];
  let feedVersion = nightly;
  const engine = () =>
    Object.assign(new EventEmitter(), {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowDowngrade: true,
      allowPrerelease: true,
      channel: null as string | null,
      checkForUpdates: async () => {
        calls.push("check");
        return { isUpdateAvailable: true, updateInfo: { version: feedVersion } };
      },
      downloadUpdate: async () => {
        calls.push("download");
        return [];
      },
    });
  const create = (autoUpdater: ReturnType<typeof engine>, currentVersion = "0.1.0") =>
    createUpdateController({
      autoUpdater,
      currentVersion,
      preferences,
      install: async () => {
        calls.push("install");
      },
    });
  try {
    const firstEngine = engine();
    const first = create(firstEngine);
    expect((await first.getState()).channel).toBe("latest");
    expect(await first.checkForUpdates()).toBeNull();
    // Current main represents a stable check that rejects a nightly-only
    // feed as up-to-date; it does not expose the held detailed checkIssue API.
    expect((await first.getState()).status).toBe("up-to-date");
    expect((await first.getState()).availableVersion).toBeNull();
    await first.setChannel("nightly");
    expect(JSON.parse(await readFile(join(root, "updates.json"), "utf8")).channel).toBe("nightly");
    const afterSwitch = calls.length;
    const secondEngine = engine();
    const second = create(secondEngine);
    expect((await second.getState()).channel).toBe("nightly");
    expect(calls).toHaveLength(afterSwitch);
    expect(secondEngine.channel).toBe("nightly");
    expect(secondEngine.allowPrerelease).toBe(true);
    expect(secondEngine.allowDowngrade).toBe(false);
    expect(secondEngine.autoDownload).toBe(false);
    expect(secondEngine.autoInstallOnAppQuit).toBe(false);
    expect(await second.checkForUpdates()).toEqual({ version: nightly });
    expect((await second.getState()).status).toBe("available");
    await second.setChannel("latest");
    expect((await second.getState()).availableVersion).toBeNull();
    await expect(second.downloadUpdate(nightly)).rejects.toThrow("Check for this update");
    expect(await second.checkForUpdates()).toBeNull();
    feedVersion = "0.2.0";
    expect(await second.checkForUpdates()).toEqual({ version: "0.2.0" });
    const thirdEngine = engine();
    const third = create(thirdEngine, "0.3.0-nightly.20261030.2");
    expect((await third.getState()).channel).toBe("latest");
    expect(await third.checkForUpdates()).toBeNull();
    expect(thirdEngine.allowDowngrade).toBe(false);
    expect(calls.every((call) => call === "check")).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
