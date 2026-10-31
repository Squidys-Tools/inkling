import { RotateCwIcon } from "@hugeicons/core-free-icons";
import type { UpdateChannel } from "@inkling/contracts/desktop";
import { SegmentedControl } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, radius, space } from "@inkling/ui/tokens.stylex";
import { Panel, PanelBody, Pill, Row, settingsText } from "./parts.tsx";
import { type AppUpdate, useAppUpdate } from "./useAppUpdate.ts";

const channels: readonly { value: UpdateChannel; label: string }[] = [
  { value: "latest", label: "Stable / Beta" },
  { value: "nightly", label: "Nightly" },
];

function statusText({ state, pending }: AppUpdate) {
  if (pending === "channel") return "Saving your channel…";
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
      return `Version ${state.downloadedVersion ?? state.availableVersion} is downloaded. Restart when you’re ready.`;
    case "installing":
      return "Installing the update and restarting inkling…";
    case "cancelled":
      return "Download cancelled. You can download it again when you’re ready.";
    case "error":
      return state.message || "The update couldn’t finish. Try again.";
    case "idle":
      return "Check when you’d like to look for a new version.";
  }
}

function retryHint(action: AppUpdate["failedAction"]) {
  if (action === "install")
    return "Try restarting and installing again. Linux may ask for system authorization.";
  if (action === "download")
    return "Check your connection and free disk space, then try downloading again.";
  return "Check your connection, then check for updates again.";
}

export function UpdatesPanel({ onClose }: { onClose: () => void }) {
  const update = useAppUpdate();
  const { state, isBusy, isReadyToInstall: ready, canDownload, failedAction } = update;
  const disabled = !state || state.status === "disabled";
  const progress =
    state?.progress === null || state?.progress === undefined || !Number.isFinite(state.progress)
      ? null
      : Math.min(100, Math.max(0, state.progress));

  return (
    <Panel title="Updates" note="Choose which inkling releases you receive." onClose={onClose}>
      <PanelBody>
        <Row
          icon={RotateCwIcon}
          title="Release channel"
          description={
            state?.currentVersion
              ? `You’re using inkling ${state.currentVersion}.`
              : "Choose which inkling releases you receive."
          }
        >
          <div {...stylex.props(styles.stack)}>
            <SegmentedControl
              name="update-channel"
              label="Update channel"
              value={state?.channel ?? "latest"}
              options={channels}
              disabled={disabled || isBusy}
              onChange={(channel) => void update.setChannel(channel)}
              style={styles.segmented}
            />
            <p {...stylex.props(settingsText.body, styles.measure)}>
              Stable / Beta is the regular release, currently in beta. Nightly is experimental and
              may be less reliable.
            </p>
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              {...stylex.props(styles.status)}
            >
              <p {...stylex.props(settingsText.status)}>{statusText(update)}</p>
              {failedAction && (
                <p {...stylex.props(settingsText.hint)}>{retryHint(failedAction)}</p>
              )}
            </div>
            {state?.status === "downloading" && (
              <div {...stylex.props(styles.progressRow)}>
                <div
                  role="progressbar"
                  aria-label="Update download"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress ?? undefined}
                  {...stylex.props(styles.track)}
                >
                  <div {...stylex.props(styles.fill(progress ?? 0))} />
                </div>
                <span {...stylex.props(settingsText.mono)}>
                  {progress === null ? "Downloading…" : `${Math.round(progress)}%`}
                </span>
              </div>
            )}
            <div {...stylex.props(styles.actions)}>
              <Pill disabled={disabled || isBusy} onClick={() => void update.check()}>
                {state?.status === "checking" ? "Checking…" : "Check for updates"}
              </Pill>
              {(canDownload || ready || state?.status === "installing") && (
                <Pill
                  look="solid"
                  disabled={disabled || isBusy}
                  onClick={() => void (ready ? update.install() : update.download())}
                >
                  {state?.status === "installing"
                    ? "Installing…"
                    : ready
                      ? "Restart and install"
                      : "Download update"}
                </Pill>
              )}
              {state?.status === "downloading" && (
                <Pill disabled={update.cancelling} onClick={() => void update.cancel()}>
                  {update.cancelling ? "Cancelling…" : "Cancel download"}
                </Pill>
              )}
            </div>
            <p {...stylex.props(settingsText.hint)}>
              Downloading never installs an update. Restart and install only when you’re ready;
              Linux may ask for system authorization.
            </p>
          </div>
        </Row>
      </PanelBody>
    </Panel>
  );
}

const styles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
    minWidth: 0,
    marginTop: space.s3,
  },
  segmented: {
    width: "fit-content",
    maxWidth: "100%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  measure: { maxWidth: "460px" },
  status: { display: "flex", flexDirection: "column", gap: space.s2 },
  progressRow: { display: "flex", alignItems: "center", gap: space.s3, minWidth: 0 },
  track: {
    flex: "1 1 auto",
    minWidth: 0,
    height: "6px",
    overflow: "hidden",
    borderRadius: radius.round,
    backgroundColor: color.raised,
  },
  fill: (percent: number) => ({
    height: "100%",
    backgroundColor: color.success,
    transformOrigin: "left",
    transform: `scaleX(${percent / 100})`,
  }),
  actions: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.s2 },
});
