import type { UpdateChannel, UpdateState } from "@inkling/contracts/desktop";
import { CancellationToken } from "builder-util-runtime";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { gt, prerelease, valid } from "semver";

type UpdateInfo = { version: string; files?: ReadonlyArray<{ url: string; sha512: string }> };
type UpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  channel: string | null;
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo: UpdateInfo } | null>;
  downloadUpdate(token?: CancellationToken): Promise<string[]>;
  on(event: "download-progress", listener: (progress: { percent: number }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
};
type ErrorContext = "check" | "download" | "install";
/** The renderer's state plus what main needs to pin a download and an install to one version. */
export type ControllerState = UpdateState & {
  downloadedVersion: string | null;
  errorContext: ErrorContext | null;
};

async function updateFileHash(path: string) {
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("base64");
}

const isMissing = (error: unknown) =>
  error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";

/** `updates.json` in the library folder: the chosen channel and the install in progress. */
export function createUpdatePreferences(path: string) {
  return {
    async read(): Promise<{ channel?: UpdateChannel; install?: { from: string; target: string } }> {
      try {
        const value = JSON.parse(await readFile(path, "utf8"));
        return {
          channel:
            value.channel === "latest" || value.channel === "nightly" ? value.channel : undefined,
          install:
            typeof value.install?.from === "string" && typeof value.install?.target === "string"
              ? { from: value.install.from, target: value.install.target }
              : undefined,
        };
      } catch (error) {
        if (isMissing(error) || error instanceof SyntaxError) return {};
        throw error;
      }
    },
    async write(value: object) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(value) + "\n", { mode: 0o600 });
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}

/**
 * Checks, downloads and installs only when asked, one action at a time. A
 * download is verified against the feed's SHA-512 before it counts, and again
 * before it installs; versions only move forward on the chosen channel.
 */
export function createUpdateController({
  autoUpdater,
  currentVersion,
  disabledReason = null,
  preferences,
  install,
  onChange = () => {},
}: {
  autoUpdater: UpdaterLike;
  currentVersion: string;
  disabledReason?: string | null;
  preferences: ReturnType<typeof createUpdatePreferences>;
  install: (file: string, version: string, sha512: string) => Promise<void>;
  onChange?: (state: ControllerState) => void;
}) {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  let state: ControllerState = {
    channel: prerelease(currentVersion)?.[0] === "nightly" ? "nightly" : "latest",
    currentVersion,
    status: disabledReason ? "disabled" : "idle",
    availableVersion: null,
    downloadedVersion: null,
    progress: null,
    message: disabledReason,
    errorContext: null,
  };
  const snapshot = () => ({ ...state });
  const set = (patch: Partial<ControllerState>) => {
    state = { ...state, ...patch };
    onChange(snapshot());
  };
  let active = false;
  let cancellation: CancellationToken | undefined;
  let download: { file: string; hash: string; version: string } | undefined;
  let installRecord: { from: string; target: string } | undefined;
  let feedFiles: NonNullable<UpdateInfo["files"]> = [];
  const applyChannel = () => {
    autoUpdater.channel = state.channel;
    autoUpdater.allowPrerelease = state.channel === "nightly";
    // electron-updater's channel setter implicitly enables downgrades.
    autoUpdater.allowDowngrade = false;
  };
  const ready = preferences
    .read()
    .then((saved) => {
      state.channel = saved.channel ?? state.channel;
      installRecord = saved.install;
      if (installRecord && installRecord.target !== currentVersion) {
        state.message = "The previous update did not apply. Check for updates to try again.";
        state.errorContext = "install";
      }
      applyChannel();
    })
    .catch(() => {
      disabledReason =
        "Update preferences could not be read. Check file permissions and restart inkling.";
      state = { ...state, status: "disabled", message: disabledReason };
    });
  const fail = (context: ErrorContext, message: string) =>
    set({ status: "error", message, errorContext: context, progress: null });
  autoUpdater.on("download-progress", ({ percent }) => {
    if (state.status === "downloading" && Number.isFinite(percent))
      set({ progress: Math.max(0, Math.min(100, percent)) });
  });
  autoUpdater.on("error", () => {
    // Operation rejections below own errors; no provider URLs or credentials reach the renderer.
    if (state.status === "installing")
      fail(
        "install",
        "The installer could not finish. Your library is unchanged; try again or install the release manually.",
      );
  });
  async function run<T>(operation: () => Promise<T>) {
    await ready;
    if (active || state.status === "installing")
      throw new Error("An update action is already running.");
    if (disabledReason) throw new Error(disabledReason);
    active = true;
    try {
      return await operation();
    } finally {
      active = false;
    }
  }
  function acceptable(version: string) {
    if (!valid(version) || !gt(version, currentVersion)) return false;
    const pre = prerelease(version);
    return state.channel === "nightly"
      ? /^\d+\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(version)
      : pre === null;
  }
  async function check() {
    applyChannel();
    set({ status: "checking", message: null, errorContext: null });
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo.version;
      const available = Boolean(result?.isUpdateAvailable && version && acceptable(version));
      feedFiles = available ? (result?.updateInfo.files ?? []) : [];
      set({
        status: available
          ? download?.version === version
            ? "downloaded"
            : "available"
          : "up-to-date",
        availableVersion: available ? version! : null,
        downloadedVersion: download?.version ?? null,
        progress: null,
      });
      return available ? { version: version! } : null;
    } catch {
      fail(
        "check",
        "Could not check this release channel. Check your connection or try again later; the publisher may not have released this channel yet.",
      );
      return null;
    }
  }
  return {
    getState: async () => {
      await ready;
      return snapshot();
    },
    checkForUpdates: () => run(check),
    setChannel: (channel: UpdateChannel) =>
      run(async () => {
        await preferences.write({ channel, install: installRecord });
        download = undefined;
        set({
          channel,
          status: "idle",
          availableVersion: null,
          downloadedVersion: null,
          progress: null,
          message: null,
          errorContext: null,
        });
        applyChannel();
        return snapshot();
      }),
    downloadUpdate: (expectedVersion: string) =>
      run(async () => {
        if (state.availableVersion !== expectedVersion || !acceptable(expectedVersion))
          throw new Error("Check for this update before downloading it.");
        cancellation = new CancellationToken();
        const token = cancellation;
        download = undefined;
        try {
          const fresh = await check();
          if (token.cancelled) throw new Error("cancelled");
          if (fresh?.version !== expectedVersion) return snapshot();
          set({
            status: "downloading",
            downloadedVersion: null,
            progress: 0,
            message: null,
            errorContext: null,
          });
          const files = await autoUpdater.downloadUpdate(token);
          if (token.cancelled) throw new Error("cancelled");
          if (!files[0]) throw new Error("No update file downloaded");
          const expectedHash = feedFiles.find(
            (file) =>
              basename(decodeURIComponent(new URL(file.url, "https://invalid.local/").pathname)) ===
              basename(files[0]),
          )?.sha512;
          if (!expectedHash || !/^[A-Za-z0-9+/]{86}==$/.test(expectedHash))
            throw new Error("The update feed has no matching SHA512 digest.");
          if ((await updateFileHash(files[0])) !== expectedHash)
            throw new Error("Downloaded bytes do not match the update feed.");
          if (token.cancelled) throw new Error("cancelled");
          download = { file: files[0], version: expectedVersion, hash: expectedHash };
          set({ status: "downloaded", downloadedVersion: expectedVersion, progress: 100 });
        } catch {
          if (token.cancelled)
            set({
              status: "cancelled",
              progress: null,
              message: "Download canceled. Nothing was installed.",
            });
          else
            fail(
              "download",
              "The update could not be downloaded or verified. Nothing was installed; try again.",
            );
        } finally {
          cancellation = undefined;
        }
        return snapshot();
      }),
    cancelDownload: async () => {
      await ready;
      cancellation?.cancel();
      return snapshot();
    },
    installUpdate: (expectedVersion: string) =>
      run(async () => {
        if (
          !download ||
          download.version !== expectedVersion ||
          state.downloadedVersion !== expectedVersion ||
          !acceptable(expectedVersion)
        )
          throw new Error("Download this update before installing it.");
        try {
          if ((await updateFileHash(download.file)) !== download.hash)
            throw new Error("Downloaded update changed");
          installRecord = { from: currentVersion, target: expectedVersion };
          await preferences.write({ channel: state.channel, install: installRecord });
          set({ status: "installing", message: null, errorContext: null });
          await install(download.file, expectedVersion, download.hash);
        } catch {
          installRecord = undefined;
          // Best effort: a failed cleanup write must not wedge the controller in "installing".
          await preferences.write({ channel: state.channel }).catch(() => {});
          fail(
            "install",
            "Installation was canceled or failed. Nothing is reported as installed; retry or use the release installer.",
          );
        }
        return snapshot();
      }),
  };
}
