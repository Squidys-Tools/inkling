import { AlertCircleIcon, Loading01Icon, RotateCwIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import { reportCaptureError } from "../capture/capture.ts";
import { errorMessage } from "../library/errors.ts";
import { type Processing, retryJob } from "../library/jobs.ts";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

function retry(jobId: string) {
  retryJob(jobId).then(
    (retried) => {
      if (!retried) reportCaptureError("That processing job is no longer available to retry.");
    },
    (error: unknown) => reportCaptureError(errorMessage(error)),
  );
}

const progress = (processing: Processing) =>
  processing.progressTotal !== null
    ? `${processing.progressCurrent}/${processing.progressTotal}`
    : "";

/** A grid card's corner mark while its jobs run, or a retry button when one failed. */
export function ProcessingBadge({ processing }: { processing: Processing }) {
  const failed = processing.failedJob;
  if (failed && !processing.active)
    return (
      <button
        type="button"
        aria-label={`${failed.message} Try again`}
        title={`${failed.message} Try again`}
        onClick={(event) => {
          event.stopPropagation();
          retry(failed.id);
        }}
        onKeyDown={(event) => event.stopPropagation()}
        {...stylex.props(styles.badge, styles.failed)}
      >
        <HugeiconsIcon icon={AlertCircleIcon} size={14} />
      </button>
    );
  if (!processing.active) return null;
  const label = processing.message ?? "Processing";
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      {...stylex.props(styles.badge, styles.active)}
    >
      <span {...stylex.props(styles.spinner)}>
        <HugeiconsIcon icon={Loading01Icon} size={13} />
      </span>
    </span>
  );
}

/** The list row's status lines: what is running, or what failed and a way to try again. */
export function ProcessingRows({
  processing,
  onPaper,
}: {
  processing: Processing;
  onPaper: boolean;
}) {
  const failed = processing.failedJob;
  return (
    <>
      {processing.active && (
        <div role="status" {...stylex.props(styles.row, styles.rowActive)}>
          <span {...stylex.props(styles.spinner)}>
            <HugeiconsIcon icon={Loading01Icon} size={13} />
          </span>
          <span>{processing.message ?? "Processing"}</span>
          <span {...stylex.props(styles.rowEnd, onPaper && styles.onPaper)}>
            {progress(processing)}
          </span>
        </div>
      )}
      {failed && (
        <div role="alert" {...stylex.props(styles.row, styles.rowFailed)}>
          <HugeiconsIcon icon={AlertCircleIcon} size={13} />
          <span>{failed.message}</span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              retry(failed.id);
            }}
            onKeyDown={(event) => event.stopPropagation()}
            {...stylex.props(styles.retry)}
          >
            <HugeiconsIcon icon={RotateCwIcon} size={12} /> Try again
          </button>
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  badge: {
    position: "absolute",
    top: "10px",
    right: "10px",
    zIndex: 3,
    display: "grid",
    placeItems: "center",
    width: "26px",
    height: "26px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: cardColor.tileButton,
  },
  active: { color: color.success, pointerEvents: "auto" },
  failed: {
    color: { default: color.danger, ":hover": cardColor.deleteInkHover },
    backgroundColor: { default: cardColor.tileButton, ":hover": cardColor.deleteHover },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  spinner: {
    display: "grid",
    placeItems: "center",
    animationName: { default: spin, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "1.2s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    marginTop: "13px",
    fontFamily: font.body,
    fontSize: "10px",
    lineHeight: 1.35,
  },
  rowActive: { color: color.success },
  rowFailed: { color: color.danger },
  rowEnd: { marginLeft: "auto", color: color.muted },
  onPaper: { color: cardColor.articleMuted },
  retry: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    marginLeft: "auto",
    paddingBlock: "3px",
    paddingInline: "8px",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: { default: "transparent", ":hover": color.surface },
    color: { default: color.muted, ":hover": color.ink },
    fontFamily: font.body,
    fontSize: "10px",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
});
