import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AvailableUpdate,
  type UpdateChannel,
  type UpdateState,
  cancelUpdateDownload,
  checkForUpdates,
  downloadUpdate,
  getUpdateState,
  installUpdate,
  setUpdateChannel,
} from "../../lib/libraryApi";

type UpdateAction = "check" | "channel" | "download" | "cancel" | "install";

const PREVIEW_STATE: UpdateState = {
  channel: "latest",
  currentVersion: "",
  status: "disabled",
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  message: "Updates are available in the installed desktop app, not the preview.",
  errorContext: null,
};

export function useAppUpdate(canUseDesktopBackend: boolean) {
  const [state, setState] = useState<UpdateState | null>(null);
  const [pendingAction, setPendingAction] = useState<UpdateAction | null>(null);
  const snapshot = useRef<UpdateState | null>(null);
  const mounted = useRef(false);
  const pending = useRef<UpdateAction | null>(null);
  const revision = useRef(0);
  const readSequence = useRef(0);

  const publish = useCallback((next: UpdateState) => {
    snapshot.current = next;
    setState(next);
  }, []);

  const refreshUpdateState = useCallback(async () => {
    if (!canUseDesktopBackend) return;
    const epoch = revision.current;
    const sequence = ++readSequence.current;
    try {
      const next = await getUpdateState();
      if (mounted.current && epoch === revision.current && sequence === readSequence.current) {
        publish(next);
      }
    } catch (error) {
      if (mounted.current && epoch === revision.current && !snapshot.current) {
        publish({
          ...PREVIEW_STATE,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          errorContext: "check",
        });
      }
    }
  }, [canUseDesktopBackend, publish]);

  useEffect(() => {
    mounted.current = true;
    const epoch = revision.current;
    const sequence = ++readSequence.current;
    if (canUseDesktopBackend) {
      void getUpdateState().then(
        (next) => {
          if (mounted.current && epoch === revision.current && sequence === readSequence.current)
            publish(next);
        },
        (error: unknown) => {
          if (
            mounted.current &&
            epoch === revision.current &&
            sequence === readSequence.current &&
            !snapshot.current
          ) {
            publish({
              ...PREVIEW_STATE,
              status: "error",
              message: error instanceof Error ? error.message : String(error),
              errorContext: "check",
            });
          }
        },
      );
    }
    const onFocus = () => void refreshUpdateState();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      revision.current += 1;
      pending.current = null;
      window.removeEventListener("focus", onFocus);
    };
  }, [canUseDesktopBackend, publish, refreshUpdateState]);

  const updateState = canUseDesktopBackend ? state : PREVIEW_STATE;
  const status = updateState?.status;
  useEffect(() => {
    if (!canUseDesktopBackend || (status !== "checking" && status !== "downloading")) return;
    const timer = window.setInterval(() => void refreshUpdateState(), 1000);
    return () => window.clearInterval(timer);
  }, [canUseDesktopBackend, refreshUpdateState, status]);

  const run = useCallback(
    async (action: UpdateAction, operation: () => Promise<UpdateState>) => {
      const current = snapshot.current;
      const cancelling = action === "cancel" && current?.status === "downloading";
      if (
        !canUseDesktopBackend ||
        !mounted.current ||
        current?.status === "disabled" ||
        (!cancelling &&
          (current?.status === "checking" ||
            current?.status === "downloading" ||
            current?.status === "installing")) ||
        (pending.current && !(cancelling && pending.current === "download"))
      ) {
        return;
      }
      // A cancel or channel change invalidates older command and polling replies.
      const epoch = ++revision.current;
      pending.current = action;
      setPendingAction(action);
      if (current) {
        const nextStatus =
          action === "check"
            ? "checking"
            : action === "download"
              ? "downloading"
              : action === "install"
                ? "installing"
                : current.status;
        publish({ ...current, status: nextStatus, message: null, errorContext: null });
      }
      try {
        const next = await operation();
        if (mounted.current && epoch === revision.current) publish(next);
      } catch (error) {
        if (mounted.current && epoch === revision.current) {
          publish({
            ...(snapshot.current ?? PREVIEW_STATE),
            status: "error",
            message: error instanceof Error ? error.message : String(error),
            errorContext:
              action === "install"
                ? "install"
                : action === "download" || action === "cancel"
                  ? "download"
                  : "check",
          });
        }
      } finally {
        if (mounted.current && epoch === revision.current) {
          revision.current += 1;
          pending.current = null;
          setPendingAction(null);
        }
      }
    },
    [canUseDesktopBackend, publish],
  );

  const handleCheckForUpdates = useCallback(
    () =>
      run("check", async () => {
        await checkForUpdates();
        return getUpdateState();
      }),
    [run],
  );
  const handleChannelChange = useCallback(
    (channel: UpdateChannel) => run("channel", () => setUpdateChannel(channel)),
    [run],
  );
  const handleDownloadUpdate = useCallback(() => {
    const current = snapshot.current;
    if (
      !current?.availableVersion ||
      current.status === "downloading" ||
      current.status === "installing"
    )
      return Promise.resolve();
    return run("download", () => downloadUpdate(current.availableVersion!));
  }, [run]);
  const handleCancelDownload = useCallback(() => {
    if (snapshot.current?.status !== "downloading") return Promise.resolve();
    return run("cancel", cancelUpdateDownload);
  }, [run]);
  const handleRestartAndInstall = useCallback(() => {
    const current = snapshot.current;
    if (
      !current?.downloadedVersion ||
      (current.status !== "downloaded" &&
        !(current.status === "error" && current.errorContext === "install"))
    )
      return Promise.resolve();
    return run("install", () => installUpdate(current.downloadedVersion!));
  }, [run]);
  const handleInstallUpdate = useCallback(() => {
    const current = snapshot.current;
    if (
      current?.downloadedVersion &&
      (current.status === "downloaded" ||
        (current.status === "error" && current.errorContext === "install"))
    )
      return handleRestartAndInstall();
    return handleDownloadUpdate();
  }, [handleDownloadUpdate, handleRestartAndInstall]);

  const isReadyToInstall = Boolean(
    updateState?.downloadedVersion &&
    (status === "downloaded" || (status === "error" && updateState?.errorContext === "install")),
  );
  const visibleVersion =
    status === "disabled"
      ? null
      : (updateState?.availableVersion ??
        (isReadyToInstall || status === "installing" ? updateState?.downloadedVersion : null));
  const availableUpdate: AvailableUpdate | null = visibleVersion
    ? { version: visibleVersion }
    : null;
  const isBusy = Boolean(
    pendingAction || status === "checking" || status === "downloading" || status === "installing",
  );

  return {
    availableUpdate,
    isInstallingUpdate: isBusy,
    updateInstallFailed: status === "error",
    handleInstallUpdate,
    updateState,
    isLoading: canUseDesktopBackend && !state,
    isReadyToInstall,
    pendingAction,
    isBusy,
    refreshUpdateState,
    handleCheckForUpdates,
    handleChannelChange,
    handleDownloadUpdate,
    handleCancelDownload,
    handleRestartAndInstall,
  };
}
