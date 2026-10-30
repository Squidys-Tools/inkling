import { Loading01Icon, RotateCwIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NavRow, navLabelClass } from "./Sidebar";
import type { useAppUpdate } from "./useAppUpdate";

export function UpdateNavRow({ update }: { update: ReturnType<typeof useAppUpdate> }) {
  const { availableUpdate, isBusy, isReadyToInstall, updateState } = update;
  if (!availableUpdate) return null;
  const failed = updateState?.status === "error";
  return (
    <NavRow
      tone="update"
      aria-live="polite"
      disabled={isBusy}
      data-tooltip={
        updateState?.message ||
        (isReadyToInstall
          ? `Version ${updateState?.downloadedVersion} is downloaded. Select to restart and install. Linux may ask for system authorization.`
          : `Version ${availableUpdate.version} is available. Select to download; installation needs a separate Restart and install action.`)
      }
      onClick={() =>
        void (failed && updateState?.errorContext === "check"
          ? update.handleCheckForUpdates()
          : update.handleInstallUpdate())
      }
    >
      <HugeiconsIcon icon={isBusy ? Loading01Icon : RotateCwIcon} size={15} />
      <span className={navLabelClass}>
        {updateState?.status === "installing"
          ? "Installing…"
          : updateState?.status === "downloading"
            ? `Downloading${updateState.progress == null ? "…" : ` ${Math.round(updateState.progress)}%`}`
            : isBusy
              ? "Updating…"
              : isReadyToInstall
                ? "Restart and install"
                : failed
                  ? updateState?.errorContext === "check"
                    ? "Check failed · retry"
                    : "Download failed · retry"
                  : "Download update"}
      </span>
    </NavRow>
  );
}
