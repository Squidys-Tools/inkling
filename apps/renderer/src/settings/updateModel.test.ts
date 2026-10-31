import { describe, expect, test } from "bun:test";
import type { UpdateState } from "@inkling/contracts/desktop";
import { createUpdateStore, updateNavRow, updateView } from "./updateModel.ts";

const idle: UpdateState = {
  channel: "latest",
  currentVersion: "1.0.0",
  status: "idle",
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  message: null,
  errorContext: null,
};
const available: UpdateState = { ...idle, status: "available", availableVersion: "1.1.0" };
const downloaded: UpdateState = { ...available, status: "downloaded", downloadedVersion: "1.1.0" };

function fakeBridge(initial: UpdateState) {
  const calls: string[] = [];
  let push: (state: UpdateState) => void = () => {};
  type Settle = { resolve: (state: UpdateState) => void; reject: (error: Error) => void };
  const settles = new Map<string, Settle>();
  let last = "";
  const call = (name: string) => () => {
    calls.push(name);
    last = name;
    return new Promise<UpdateState>((resolve, reject) => {
      settles.set(name, { resolve, reject });
    });
  };
  const bridge = {
    state: () => Promise.resolve(initial),
    check: call("check"),
    download: call("download"),
    install: call("install"),
    cancel: call("cancel"),
    setChannel: call("channel"),
    onState: (listener: (state: UpdateState) => void) => {
      push = listener;
      return () => {};
    },
  };
  return {
    bridge,
    calls,
    push: (state: UpdateState) => push(state),
    settle: (name = last) => settles.get(name)!,
  };
}

async function started(initial: UpdateState) {
  const fake = fakeBridge(initial);
  const store = createUpdateStore(fake.bridge);
  store.subscribe(() => {});
  await Promise.resolve();
  return { ...fake, store };
}

describe("update store", () => {
  test("runs one action at a time", async () => {
    const { store, calls, settle } = await started(available);
    const check = store.check();
    void store.download();
    void store.setChannel("nightly");
    expect(calls).toEqual(["check"]);
    expect(updateView(store.get())).toMatchObject({ pending: "check", isBusy: true });

    settle().resolve(available);
    await check;
    void store.download();
    expect(calls).toEqual(["check", "download"]);
  });

  test("installs only a downloaded update, and offers the install again after it fails", async () => {
    const { store, calls, push, settle } = await started(available);
    await store.install();
    expect(calls).toEqual([]);

    push(downloaded);
    const install = store.install();
    settle().reject(new Error("authorization refused"));
    await install;

    const view = updateView(store.get());
    expect(view).toMatchObject({ isReadyToInstall: true, failedAction: "install" });
    expect(view.state?.message).toBe("authorization refused");
    expect(updateNavRow(view)?.action).toBe("install");
  });

  test("a failed download offers a retry, and a failed check or channel change a new check", async () => {
    const { store, settle } = await started(available);
    const download = store.download();
    settle().reject(new Error("offline"));
    await download;
    expect(updateNavRow(updateView(store.get()))).toMatchObject({
      label: "Download failed · retry",
      action: "download",
    });

    const check = store.check();
    settle().reject(new Error("offline"));
    await check;
    expect(updateNavRow(updateView(store.get()))).toMatchObject({
      label: "Check failed · retry",
      action: "check",
    });

    const channel = store.setChannel("nightly");
    settle().reject(new Error("preferences are read-only"));
    await channel;
    expect(updateNavRow(updateView(store.get()))?.action).toBe("check");
  });

  test("a failure main reports is read from its context, not from this window's last action", async () => {
    const { store, push } = await started(available);
    push({ ...available, status: "error", errorContext: "download", message: "disk full" });
    expect(updateNavRow(updateView(store.get()))).toMatchObject({
      label: "Download failed · retry",
      action: "download",
    });
    push({ ...downloaded, status: "error", errorContext: "install", availableVersion: null });
    expect(updateNavRow(updateView(store.get()))).toMatchObject({
      label: "Restart and install",
      action: "install",
    });
  });

  test("cancels a download while it is the pending action", async () => {
    const { store, calls, settle } = await started(available);
    const download = store.download();
    const cancel = store.cancel();
    expect(calls).toEqual(["download", "cancel"]);
    expect(updateView(store.get())).toMatchObject({ pending: "download", cancelling: true });

    settle("cancel").resolve({ ...available, status: "downloading", progress: 12 });
    await cancel;
    settle("download").resolve({ ...available, status: "cancelled" });
    await download;
    expect(updateView(store.get())).toMatchObject({
      pending: null,
      cancelling: false,
      canDownload: true,
      state: { status: "cancelled" },
    });
  });

  test("the preview shows updates as disabled and never offers one", () => {
    const store = createUpdateStore(undefined);
    const view = updateView(store.get());
    expect(view.state?.status).toBe("disabled");
    expect(updateNavRow(view)).toBeNull();
  });
});

test.each([
  [{ status: "available" }, "Download update"],
  [{ status: "downloading", progress: 42.4 }, "Downloading 42%"],
  [{ status: "downloading", progress: null }, "Downloading…"],
  [{ status: "downloaded", downloadedVersion: "1.1.0" }, "Restart and install"],
  [{ status: "installing" }, "Installing…"],
  [{ status: "disabled" }, null],
  [{ status: "up-to-date", availableVersion: null }, null],
] as const)("the sidebar row for %o reads %p", (change, label) => {
  const view = updateView({
    state: { ...available, ...change },
    pending: null,
    cancelling: false,
  });
  expect(updateNavRow(view)?.label ?? null).toBe(label);
});
