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
    check: () => run("check", (updates) => updates.check()),
    setChannel: (channel: UpdateChannel) =>
      run("channel", (updates) => updates.setChannel(channel)),
    download: async () => {
      if (!snapshot.state?.availableVersion || isReadyToInstall(snapshot)) return;
      await run("download", (updates) => updates.download());
    },
    install: async (version: string) => {
      if (!isReadyToInstall(snapshot)) return;
      await run("install", (updates) => updates.install(version));
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
  // Main reports 100% before the download is verified, so a download that rounds to 100% is verifying.
  const verifying = status === "downloading" && Math.round(state?.progress ?? 0) >= 100;
  return {
    state,
    pending,
    cancelling,
    isLoading: state === null,
    isBusy: pending !== null || (status !== undefined && inFlight(status)),
    isReadyToInstall: ready,
    verifying,
    availableVersion,
    canDownload: Boolean(availableVersion) && !ready && status !== undefined && !inFlight(status),
    failedAction: status === "error" ? (state?.errorContext ?? "check") : null,
  };
}

export type UpdateView = ReturnType<typeof updateView>;

export type UpdateNavPhase =
  | "available"
  | "checking"
  | "downloading"
  | "verifying"
  | "ready"
  | "installing"
  | "failed";

export type UpdateNavRow = {
  phase: UpdateNavPhase;
  label: string;
  /** The version on offer or ready, or a download's percentage. */
  detail: string | null;
  /** 0 to 100 while the download runs and is verified; null when the row has no bar. */
  progress: number | null;
  description: string;
  busy: boolean;
  action: Exclude<UpdateAction, "channel">;
};

/**
 * The sidebar row that offers a new version, or null when there is none. Main
 * reports 100% before the download is verified, so 100% reads as verifying.
 */
export function updateNavRow({
  state,
  isBusy,
  isReadyToInstall: ready,
  verifying,
  availableVersion,
  failedAction,
}: UpdateView): UpdateNavRow | null {
  if (!state || !availableVersion) return null;
  const version = ready ? (state.downloadedVersion ?? availableVersion) : availableVersion;
  const clamped = state.progress === null ? null : Math.min(100, Math.max(0, state.progress));
  const percent = clamped === null ? null : Math.round(clamped);
  const phase: UpdateNavPhase =
    state.status === "installing"
      ? "installing"
      : state.status === "checking"
        ? "checking"
        : state.status === "downloading"
          ? verifying
            ? "verifying"
            : "downloading"
          : ready
            ? state.status === "error"
              ? "failed"
              : "ready"
            : failedAction
              ? "failed"
              : "available";
  const failedLabel =
    failedAction === "install"
      ? "Install failed"
      : failedAction === "check"
        ? "Check failed"
        : "Download failed";
  const label = {
    available: "Update available",
    checking: "Checking…",
    downloading: "Downloading",
    verifying: "Verifying download",
    ready: "Restart to update",
    installing: "Installing…",
    failed: failedLabel,
  }[phase];
  const description = {
    available:
      state.status === "cancelled" && state.message
        ? state.message
        : `Version ${availableVersion} is available. Select to download.`,
    checking: "Checking this release channel for a newer version.",
    downloading: `Downloading version ${availableVersion}. You can keep using inkling.`,
    verifying: `Checking version ${availableVersion} against the release feed before it can install.`,
    ready: `Version ${version} is downloaded. Select to restart and install. Linux may ask for system authorization.`,
    installing: `Installing version ${version} and restarting inkling.`,
    failed: state.message || "The update couldn’t finish. Try again.",
  }[phase];
  const detail =
    phase === "available" || phase === "ready"
      ? version
      : phase === "downloading" && percent !== null
        ? `${percent}%`
        : null;
  const action: Exclude<UpdateAction, "channel"> =
    phase === "ready" || (phase === "failed" && failedAction === "install")
      ? "install"
      : phase === "failed" && failedAction === "check"
        ? "check"
        : "download";
  return {
    phase,
    label,
    detail,
    progress: phase === "downloading" || phase === "verifying" ? clamped : null,
    description,
    busy: isBusy,
    action,
  };
}
