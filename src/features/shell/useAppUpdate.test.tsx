import { afterEach, beforeEach, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { UpdateState } from "../../lib/libraryApi";
import { useAppUpdate } from "./useAppUpdate";

const initial: UpdateState = {
  channel: "nightly",
  currentVersion: "0.1.0",
  status: "available",
  availableVersion: "0.2.0-nightly.1",
  downloadedVersion: null,
  progress: null,
  message: null,
  errorContext: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let root: Root;
let update: ReturnType<typeof useAppUpdate>;
let backend: UpdateState;
let reads: () => Promise<UpdateState>;
let download: () => Promise<UpdateState>;
let installs: string[];
let checks: number;
let readCount: number;
let downloads: string[];

function Probe({ enabled }: { enabled: boolean }) {
  const controller = useAppUpdate(enabled);
  useEffect(() => {
    update = controller;
  }, [controller]);
  return null;
}

beforeEach(() => {
  const { window: domWindow } = parseHTML(
    "<!doctype html><html><body><div id='root'></div></body></html>",
  );
  Object.assign(globalThis, {
    window: domWindow,
    document: domWindow.document,
    HTMLElement: domWindow.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  backend = { ...initial };
  reads = async () => backend;
  download = async () =>
    (backend = {
      ...backend,
      status: "downloaded",
      downloadedVersion: backend.availableVersion,
      progress: 100,
    });
  installs = [];
  downloads = [];
  checks = 0;
  readCount = 0;
  Object.defineProperty(window, "inkling", {
    configurable: true,
    value: {
      commands: {
        get_update_state: () => {
          readCount += 1;
          return reads();
        },
        check_for_updates: async () => {
          checks += 1;
          return { version: backend.availableVersion };
        },
        set_update_channel: async ({ channel }: { channel: "latest" | "nightly" }) =>
          (backend = {
            ...backend,
            channel,
            status: "idle",
            availableVersion: null,
            downloadedVersion: null,
          }),
        download_update: ({ expectedVersion }: { expectedVersion: string }) => {
          downloads.push(expectedVersion);
          return download();
        },
        cancel_update_download: async () =>
          (backend = { ...backend, status: "cancelled", progress: null }),
        install_update: async ({ expectedVersion }: { expectedVersion: string }) => {
          installs.push(expectedVersion);
          return { ...backend, status: "installing" };
        },
      },
    },
  });
  root = createRoot(document.getElementById("root")!);
});

afterEach(async () => {
  await act(() => root.unmount());
});

async function mount(enabled = true) {
  await act(async () => {
    root.render(<Probe enabled={enabled} />);
  });
}

test("persisted channel loads without a network check; sidebar download requires a separate install click", async () => {
  await mount();
  expect(update.updateState?.channel).toBe("nightly");
  expect(checks).toBe(0);
  await act(async () => {
    await update.handleInstallUpdate();
  });
  expect(downloads).toEqual([initial.availableVersion!]);
  expect(installs).toEqual([]);
  expect(update.updateState?.status).toBe("downloaded");
  await act(async () => {
    await update.handleInstallUpdate();
  });
  expect(installs).toEqual([initial.availableVersion!]);
});

test("cancelling supersedes a late download completion and never installs", async () => {
  const pendingDownload = deferred<UpdateState>();
  download = () => pendingDownload.promise;
  await mount();
  let downloading!: Promise<void>;
  await act(() => {
    downloading = update.handleDownloadUpdate();
  });
  expect(update.updateState?.status).toBe("downloading");
  backend = { ...backend, status: "downloading", progress: 42 };
  await act(async () => {
    await update.refreshUpdateState();
  });
  expect(update.updateState?.progress).toBe(42);
  expect(update.isBusy).toBe(true);
  expect(checks).toBe(0);
  await act(async () => {
    await update.handleCancelDownload();
  });
  await act(async () => {
    pendingDownload.resolve({
      ...initial,
      status: "downloaded",
      downloadedVersion: initial.availableVersion,
    });
    await downloading;
  });
  expect(update.updateState?.status).toBe("cancelled");
  expect(update.updateState?.downloadedVersion).toBeNull();
  expect(installs).toEqual([]);
});

test("channel persistence wins over a stale state read, and a double activation is ignored", async () => {
  await mount();
  const oldRead = deferred<UpdateState>();
  reads = () => oldRead.promise;
  let refreshing!: Promise<void>;
  await act(() => {
    refreshing = update.refreshUpdateState();
  });
  await act(async () => {
    await update.handleChannelChange("latest");
  });
  await act(async () => {
    oldRead.resolve(initial);
    await refreshing;
  });
  expect(update.updateState?.channel).toBe("latest");
  expect(update.availableUpdate).toBeNull();
  backend = { ...initial, channel: "latest" };
  reads = async () => backend;
  await act(async () => {
    await update.handleCheckForUpdates();
  });
  const pendingDownload = deferred<UpdateState>();
  download = () => pendingDownload.promise;
  let first!: Promise<void>;
  await act(() => {
    first = update.handleInstallUpdate();
    void update.handleInstallUpdate();
  });
  expect(downloads).toHaveLength(1);
  await act(async () => {
    pendingDownload.resolve({
      ...backend,
      status: "downloaded",
      downloadedVersion: backend.availableVersion,
    });
    await first;
  });
  expect(installs).toEqual([]);
});

test("install authentication failure stays actionable and preserves the verified download", async () => {
  backend = {
    ...initial,
    status: "downloaded",
    availableVersion: null,
    downloadedVersion: initial.availableVersion,
  };
  Object.assign(window.inkling!.commands, {
    install_update: async () => {
      throw new Error("System authorization was cancelled.");
    },
  });
  await mount();
  await act(async () => {
    await update.handleRestartAndInstall();
  });
  expect(update.updateState?.status).toBe("error");
  expect(update.updateState?.errorContext).toBe("install");
  expect(update.availableUpdate?.version).toBe(initial.availableVersion!);
  expect(update.isReadyToInstall).toBe(true);
  expect(update.updateState?.message).toBe("System authorization was cancelled.");
  expect(update.updateState?.downloadedVersion).toBe(initial.availableVersion);
  expect(update.isBusy).toBe(false);
});

test("preview never invokes updater IPC, and unsupported installations cannot download", async () => {
  await mount(false);
  await act(async () => {
    await update.handleCheckForUpdates();
    await update.handleInstallUpdate();
  });
  expect(update.updateState?.status).toBe("disabled");
  expect(readCount).toBe(0);
  expect(checks).toBe(0);
  expect(downloads).toEqual([]);
  backend = { ...initial, status: "disabled", message: "This package does not support updates." };
  await act(async () => {
    root.render(<Probe enabled={true} />);
  });
  await act(async () => {
    await update.handleDownloadUpdate();
  });
  expect(update.updateState?.message).toBe(backend.message);
  expect(update.availableUpdate).toBeNull();
  expect(downloads).toEqual([]);
});
