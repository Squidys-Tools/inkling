import type {
  DesktopBridge,
  UpdateChannel,
  UpdateErrorContext,
  UpdateState,
} from "@inkling/contracts/desktop";
import { errorMessage } from "../library/errors.ts";

export type UpdateAction = "check" | "channel" | "download" | "install";

export type UpdateSnapshot = {
  /** Null until the desktop app first answers. */
  state: UpdateState | null;
  pending: UpdateAction | null;
  /** Cancel runs beside the download it stops, which stays the pending action. */
  cancelling: boolean;
};

type UpdateBridge = DesktopBridge["updates"];

const previewUpdateState: UpdateState = {
  channel: "latest",
  currentVersion: "",
  status: "disabled",
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  message: "Updates are available in the installed desktop app, not the preview.",
  errorContext: null,
};

const inFlight = (status: UpdateState["status"]) =>
  status === "checking" || status === "downloading" || status === "installing";

const startedStatus = {
  check: "checking",
  channel: null,
  download: "downloading",
  install: "installing",
} as const;

// A call the bridge itself rejects is reported against the step it was taking,
// as main reports its own failures; a failed channel change reads as a failed check.
const failedStep: Record<UpdateAction | "cancel", UpdateErrorContext> = {
  check: "check",
  channel: "check",
  download: "download",
  cancel: "download",
  install: "install",
};

function isReadyToInstall({ state }: UpdateSnapshot) {
  return Boolean(
    state?.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" && state.errorContext === "install")),
  );
}

/**
 * The update state the desktop app pushes, plus the action this window has
 * running. One action runs at a time, and none while main is checking,
 * downloading or installing. Every state main sends, as a reply or a push,
 * replaces the last: both travel on one IPC pipe, in order.
 */
export function createUpdateStore(bridge: UpdateBridge | undefined) {
  let snapshot: UpdateSnapshot = {
    state: bridge ? null : previewUpdateState,
    pending: null,
    cancelling: false,
  };
  const listeners = new Set<() => void>();
  let started = false;

  const set = (next: Partial<UpdateSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  const start = () => {
    if (started || !bridge) return;
    started = true;
    bridge.onState((state) => set({ state }));
    bridge.state().then(
      (state) => set({ state }),
      (error: unknown) => {
        if (snapshot.state) return;
        set({
          state: {
            ...previewUpdateState,
            status: "error",
            message: errorMessage(error),
            errorContext: "check",
          },
        });
      },
    );
  };

  const settle = async (action: UpdateAction | "cancel", reply: Promise<UpdateState>) => {
    try {
      set({ state: await reply });
    } catch (error) {
      const state = snapshot.state ?? previewUpdateState;
      set({
        state: {
          ...state,
          status: "error",
          message: errorMessage(error),
          errorContext: failedStep[action],
        },
      });
    }
  };

  const run = async (
    action: UpdateAction,
    call: (bridge: UpdateBridge) => Promise<UpdateState>,
  ) => {
    const current = snapshot.state;
    if (!bridge || !current || snapshot.pending) return;
    if (current.status === "disabled" || inFlight(current.status)) return;
    set({
      pending: action,
      state: {
        ...current,
        status: startedStatus[action] ?? current.status,
        message: null,
        errorContext: null,
      },
    });
    await settle(action, call(bridge));
    set({ pending: null });
  };

  const observe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };

  const cancel = async () => {
    if (!bridge || snapshot.cancelling || snapshot.state?.status !== "downloading") return;
    set({ cancelling: true });
    await settle("cancel", bridge.cancel());
    set({ cancelling: false });
  };

  return {
    get: () => snapshot,
    subscribe: (listener: () => void) => {
      start();
      return observe(listener);
    },
    /** Follows the state without asking main for it, which would load the updater there. */
    observe,
    check: () => run("check", (updates) => updates.check()),
    setChannel: (channel: UpdateChannel) =>
      run("channel", (updates) => updates.setChannel(channel)),
    download: async () => {
      if (!snapshot.state?.availableVersion || isReadyToInstall(snapshot)) return;
      await run("download", (updates) => updates.download());
    },
    install: async () => {
      if (!isReadyToInstall(snapshot)) return;
      await run("install", (updates) => updates.install());
    },
    cancel,
  };
}

export function updateView(snapshot: UpdateSnapshot) {
  const { state, pending, cancelling } = snapshot;
  const status = state?.status;
  const ready = isReadyToInstall(snapshot);
  const availableVersion =
    status === "disabled"
      ? null
      : (state?.availableVersion ??
        (ready || status === "installing" ? state?.downloadedVersion : null) ??
        null);
  return {
    state,
    pending,
    cancelling,
    isLoading: state === null,
    isBusy: pending !== null || (status !== undefined && inFlight(status)),
    isReadyToInstall: ready,
    availableVersion,
    canDownload: Boolean(availableVersion) && !ready && status !== undefined && !inFlight(status),
    failedAction: status === "error" ? (state?.errorContext ?? "check") : null,
  };
}

export type UpdateView = ReturnType<typeof updateView>;

/** The sidebar row that offers a new version, or null when there is none. */
export function updateNavRow({
  state,
  isBusy,
  isReadyToInstall: ready,
  availableVersion,
  failedAction,
}: UpdateView) {
  if (!state || !availableVersion) return null;
  const label =
    state.status === "installing"
      ? "Installing…"
      : state.status === "downloading"
        ? `Downloading${state.progress === null ? "…" : ` ${Math.round(state.progress)}%`}`
        : isBusy
          ? "Updating…"
          : ready
            ? "Restart and install"
            : failedAction === "check"
              ? "Check failed · retry"
              : failedAction
                ? "Download failed · retry"
                : "Download update";
  const description =
    state.message ||
    (ready
      ? `Version ${state.downloadedVersion ?? availableVersion} is downloaded. Select to restart and install. Linux may ask for system authorization.`
      : `Version ${availableVersion} is available. Select to download; installation needs a separate Restart and install action.`);
  const action: Exclude<UpdateAction, "channel"> =
    failedAction === "check" ? "check" : ready ? "install" : "download";
  return { label, description, busy: isBusy, action };
}
