import { AlertCircleIcon, RotateCwIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, radius } from "@inkling/ui/tokens.stylex";
import { errorMessage } from "../library/errors.ts";
import { type Processing, retryJob } from "../library/jobs.ts";
import { reportActionError } from "./actionError.ts";

function retry(jobId: string) {
  retryJob(jobId).then(
    (retried) => {
      if (!retried) reportActionError("That processing job is no longer available to retry.");
    },
    (error: unknown) => reportActionError(`Couldn’t try again: ${errorMessage(error)}`),
  );
}

const ringLength = 2 * Math.PI * 5;

/**
 * A still mark for running jobs: a ring filled to the jobs' progress, or a
 * dashed ring while they report none. It changes only when progress does.
 */
function ProgressRing({ processing }: { processing: Processing }) {
  const { progressCurrent, progressTotal } = processing;
  const fraction =
    progressTotal && progressTotal > 0
      ? Math.min(1, Math.max(0, progressCurrent / progressTotal))
      : null;
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeOpacity={fraction === null ? 1 : 0.28}
        strokeDasharray={fraction === null ? "2.2 1.73" : undefined}
      />
      {fraction !== null && fraction > 0 && (
        <circle
          cx="7"
          cy="7"
          r="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${fraction * ringLength} ${ringLength}`}
          transform="rotate(-90 7 7)"
        />
      )}
    </svg>
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
      <ProgressRing processing={processing} />
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
          <ProgressRing processing={processing} />
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
