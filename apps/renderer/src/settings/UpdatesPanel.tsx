import Download04Icon from "@hugeicons/core-free-icons/Download04Icon";
import RotateCwIcon from "@hugeicons/core-free-icons/RotateCwIcon";
import { SegmentedControl } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, radius, space } from "@inkling/ui/tokens.stylex";
import { platform } from "../desktop.ts";
import { MascotStill } from "../mascot/Mascot.tsx";
import { ActionButton, Card, CardRow, inset, Panel, PanelBody, settingsText } from "./parts.tsx";
import { channelName, channelOptions } from "./updateModel.ts";
import { type AppUpdate, useAppUpdate } from "./useAppUpdate.ts";

function statusText({ state, pending, verifying }: AppUpdate) {
  if (pending === "channel") return "Saving your channel…";
  if (!state) return "Loading update settings…";
  switch (state.status) {
    case "disabled":
      return state.message || "Updates aren’t supported by this installation.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return `You’re up to date on ${channelName(state.channel)}`;
    case "available":
      return "Ready to download when you are";
    case "downloading":
      return verifying
        ? "Checking the download against the release feed"
        : "Downloading · you can keep using inkling";
    case "downloaded":
      return "Downloaded · restart when you’re ready";
    case "installing":
      return "Installing and restarting inkling…";
    case "cancelled":
      return "Download cancelled · download it again when you’re ready";
    case "error":
      return state.message || "The update couldn’t finish. Try again.";
    case "idle":
      return `On ${channelName(state.channel)} · check when you’d like`;
  }
}

function retryHint(action: AppUpdate["failedAction"]) {
  if (action === "install")
    return "Try restarting and installing again. Linux may ask for system authorization.";
  if (action === "download")
    return "Check your connection and free disk space, then try downloading again.";
  return "Check your connection, then check for updates again.";
}

type Tone = keyof typeof dots;

function tone({ state, failedAction }: AppUpdate): Tone {
  if (failedAction || state?.status === "error") return "danger";
  switch (state?.status) {
    case "up-to-date":
      return "success";
    case "available":
    case "downloading":
    case "downloaded":
    case "installing":
      return "accent";
    default:
      return "muted";
  }
}

export function UpdatesPanel({ onClose }: { onClose: () => void }) {
  const update = useAppUpdate();
  const { state, isBusy, isReadyToInstall: ready, canDownload, failedAction, verifying } = update;
  const disabled = !state || state.status === "disabled";
  const downloading = state?.status === "downloading" && !verifying;
  const installing = state?.status === "installing";
  const progress = ready
    ? 100
    : state?.progress === null || state?.progress === undefined || !Number.isFinite(state.progress)
      ? null
      : Math.min(100, Math.max(0, state.progress));
  const newVersion = state?.downloadedVersion ?? state?.availableVersion;
  const title =
    (ready || installing) && newVersion
      ? `${newVersion} is ready`
      : canDownload && newVersion
        ? `${newVersion} is available`
        : state
          ? `inkling ${state.currentVersion}`
          : "inkling";

  return (
    <Panel
      title="Updates"
      note="inkling looks for a new version when you ask, and downloads it only when you say so."
      onClose={onClose}
    >
      <PanelBody>
        <Card>
          <div {...stylex.props(styles.hero)}>
            <MascotStill size={50} />
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              {...stylex.props(styles.heroText)}
            >
              <p {...stylex.props(styles.version)}>{title}</p>
              <p {...stylex.props(styles.status)}>
                <span aria-hidden="true" {...stylex.props(styles.dot, dots[tone(update)])} />
                {statusText(update)}
              </p>
              {failedAction && (
                <p {...stylex.props(settingsText.hint)}>{retryHint(failedAction)}</p>
              )}
            </div>
            {downloading ? (
              <ActionButton disabled={update.cancelling} onClick={() => void update.cancel()}>
                {update.cancelling ? "Cancelling…" : "Cancel download"}
              </ActionButton>
            ) : verifying ? (
              <ActionButton disabled>Verifying…</ActionButton>
            ) : canDownload || ready || installing ? (
              <ActionButton
                look="primary"
                icon={ready || installing ? undefined : Download04Icon}
                disabled={disabled || isBusy}
                onClick={() => void (ready ? update.install() : update.download())}
              >
                {installing ? "Installing…" : ready ? "Restart to update" : "Download"}
              </ActionButton>
            ) : (
              <ActionButton
                icon={RotateCwIcon}
                disabled={disabled || isBusy}
                onClick={() => void update.check()}
              >
                {state?.status === "checking" ? "Checking…" : "Check for updates"}
              </ActionButton>
            )}
          </div>
          {(downloading || ready) && (
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
              {downloading && (
                <span {...stylex.props(settingsText.mono)}>
                  {progress === null ? "Downloading…" : `${Math.round(progress)}%`}
                </span>
              )}
            </div>
          )}
        </Card>
        <div {...stylex.props(styles.channel)}>
          <Card>
            <CardRow
              title="Update channel"
              description="Alpha gets releases we’ve tested. Nightly gets each day’s build, with newer features and rougher edges."
              action={
                <SegmentedControl
                  name="update-channel"
                  label="Update channel"
                  value={state?.channel ?? "latest"}
                  options={channelOptions}
                  disabled={disabled || isBusy}
                  onChange={(channel) => void update.setChannel(channel)}
                  style={[inset.capsule, inset.onCard, styles.segmented]}
                />
              }
            />
          </Card>
          {platform === "linux" && (ready || installing) && (
            <p {...stylex.props(settingsText.hint, styles.hint)}>
              Linux may ask for system authorization when the update installs.
            </p>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}

const dots = stylex.create({
  muted: { backgroundColor: color.faint, boxShadow: `0 0 0 4px ${color.overlayHover}` },
  success: {
    backgroundColor: color.success,
    boxShadow: `0 0 0 4px ${color.successSoft}`,
  },
  accent: { backgroundColor: color.accentStrong, boxShadow: `0 0 0 4px ${color.accentSoft}` },
  danger: { backgroundColor: color.danger, boxShadow: `0 0 0 4px ${color.dangerSoft}` },
});

const styles = stylex.create({
  hero: {
    display: "flex",
    alignItems: "center",
    gap: "18px",
    padding: space.s5,
  },
  heroText: {
    display: "flex",
    flex: "1 1 auto",
    flexDirection: "column",
    gap: "5px",
    minWidth: 0,
  },
  version: {
    margin: 0,
    fontFamily: font.display,
    fontSize: "26px",
    lineHeight: "30px",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    color: color.inkStrong,
  },
  status: {
    display: "flex",
    alignItems: "flex-start",
    gap: "9px",
    margin: 0,
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "18px",
    color: color.muted,
  },
  dot: { flex: "none", width: "8px", height: "8px", marginTop: "5px", borderRadius: radius.round },
  progressRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    minWidth: 0,
    paddingInline: space.s5,
    paddingBottom: "18px",
  },
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
  channel: { display: "flex", flexDirection: "column", flexShrink: 0, marginTop: "26px" },
  segmented: { flexShrink: 0 },
  hint: { marginTop: space.s2, marginInline: "2px", color: color.faint },
});
