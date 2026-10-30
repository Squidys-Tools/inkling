import { RotateCwIcon } from "@hugeicons/core-free-icons";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import type { UpdateChannel, UpdateState } from "../../lib/libraryApi";
import type { useAppUpdate } from "../shell/useAppUpdate";
import { pillButton, SettingsRow } from "./SettingsPanel";

type AppUpdate = ReturnType<typeof useAppUpdate>;

const CHANNELS: readonly { value: UpdateChannel; label: string }[] = [
  { value: "latest", label: "Stable / Beta" },
  { value: "nightly", label: "Nightly" },
];

function updateStatus(state: UpdateState | null) {
  if (!state) return "Loading update settings…";
  switch (state.status) {
    case "disabled":
      return state.message || "Updates aren’t supported by this installation.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "You’re up to date on this channel.";
    case "available":
      return `Version ${state.availableVersion} is available to download.`;
    case "downloading":
      return "Downloading the update. You can keep using inkling.";
    case "downloaded":
      return `Version ${state.downloadedVersion} is downloaded. Restart when you’re ready.`;
    case "installing":
      return "Installing the update and restarting inkling…";
    case "cancelled":
      return "Download cancelled. You can download it again when you’re ready.";
    case "error":
      return state.message || "The update couldn’t finish. Try again.";
    default:
      return "Check when you’d like to look for a new version.";
  }
}

function retryHint(context: UpdateState["errorContext"]) {
  if (context === "install")
    return "Try restarting and installing again. Linux may ask for system authorization.";
  if (context === "download")
    return "Check your connection and free disk space, then try downloading again.";
  return "Check your connection, then check for updates again.";
}

export function UpdateSettings({ update }: { update: AppUpdate }) {
  const { updateState: state, isLoading, isBusy, pendingAction } = update;
  const disabled = isLoading || !state || state.status === "disabled";
  const downloading = state?.status === "downloading";
  const ready = update.isReadyToInstall;
  const canDownload = Boolean(
    state?.availableVersion && !ready && !downloading && state?.status !== "installing",
  );
  const progress =
    state?.progress == null || !Number.isFinite(state.progress)
      ? undefined
      : Math.min(100, Math.max(0, state.progress));

  return (
    <SettingsRow
      icon={RotateCwIcon}
      title="Updates"
      description={
        state?.currentVersion
          ? `You’re using inkling ${state.currentVersion}.`
          : "Choose which inkling releases you receive."
      }
      action={null}
    >
      <div className="mt-3 flex min-w-0 flex-col gap-3">
        <fieldset
          disabled={disabled || isBusy}
          className="m-0 min-w-0 border-0 p-0 disabled:opacity-42"
        >
          <legend className="sr-only">Update channel</legend>
          <SegmentedControl
            className="w-fit max-w-full border border-[#221f1c] bg-surface"
            name="update-channel"
            label="Update channel"
            value={state?.channel ?? "latest"}
            options={CHANNELS}
            onChange={(channel) => void update.handleChannelChange(channel)}
          />
        </fieldset>
        <p className="m-0 max-w-[460px] font-body text-[13px]/[19px] font-normal text-muted">
          Stable / Beta is the regular release, currently in beta. Nightly is experimental and may
          be less reliable.
        </p>
        <div className="flex flex-col gap-2" role="status" aria-live="polite" aria-atomic="true">
          <p className="m-0 font-body text-[13px]/[19px] font-normal text-ink-soft">
            {pendingAction === "channel" ? "Saving your channel…" : updateStatus(state)}
          </p>
          {state?.status === "error" && (
            <p className="m-0 font-body text-[12px]/[18px] font-normal text-muted">
              {retryHint(state.errorContext)}
            </p>
          )}
        </div>
        {downloading && (
          <div className="flex min-w-0 items-center gap-3">
            <progress
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full accent-green [&::-webkit-progress-bar]:bg-surface-raised [&::-webkit-progress-value]:bg-green"
              aria-label="Update download"
              value={progress}
              max={100}
            />
            <span className="font-mono text-[12px]/4 font-normal text-muted">
              {progress === undefined ? "Downloading…" : `${Math.round(progress)}%`}
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pillButton()}
            disabled={disabled || isBusy}
            onClick={() => void update.handleCheckForUpdates()}
          >
            {state?.status === "checking" ? "Checking…" : "Check for updates"}
          </button>
          {(canDownload || ready || state?.status === "installing") && (
            <button
              type="button"
              className={pillButton("solid")}
              disabled={disabled || isBusy}
              onClick={() =>
                void (ready ? update.handleRestartAndInstall() : update.handleDownloadUpdate())
              }
            >
              {state?.status === "installing"
                ? "Installing…"
                : ready
                  ? "Restart and install"
                  : "Download update"}
            </button>
          )}
          {downloading && (
            <button
              type="button"
              className={pillButton()}
              disabled={pendingAction === "cancel"}
              onClick={() => void update.handleCancelDownload()}
            >
              {pendingAction === "cancel" ? "Cancelling…" : "Cancel download"}
            </button>
          )}
        </div>
        <p className="m-0 font-body text-[12px]/[18px] font-normal text-muted">
          Downloading never installs an update. Restart and install only when you’re ready; Linux
          may ask for system authorization.
        </p>
      </div>
    </SettingsRow>
  );
}
