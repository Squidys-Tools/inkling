import TriangleAlertIcon from "@inkling/ui/icons/TriangleAlert";
import XIcon from "@inkling/ui/icons/X";
import CircleCheckIcon from "@inkling/ui/icons/CircleCheck";
import ArrowDownToLineIcon from "@inkling/ui/icons/ArrowDownToLine";
import RotateCwIcon from "@inkling/ui/icons/RotateCw";
import ShieldCheckIcon from "@inkling/ui/icons/ShieldCheck";
import { Icon, type IconData } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";
import { cardColor, color, font, loadingColor, motion, radius } from "@inkling/ui/tokens.stylex";
import { Beam, Dim } from "../cards/CardState.tsx";
import { useAppUpdate } from "../settings/useAppUpdate.ts";
import type { UpdateNavPhase } from "../settings/updateModel.ts";
import { GooLiquid } from "./GooLiquid.tsx";

const icons: Record<UpdateNavPhase, IconData> = {
  available: ArrowDownToLineIcon,
  checking: RotateCwIcon,
  downloading: ArrowDownToLineIcon,
  verifying: ShieldCheckIcon,
  ready: CircleCheckIcon,
  installing: CircleCheckIcon,
  failed: TriangleAlertIcon,
};

// Each state borrows a card's own look: an offer is outlined, a finished update is solid ink,
// and a failure is drained and veiled like a failed card.
const toneOf: Record<UpdateNavPhase, "quiet" | "offer" | "ready" | "failed"> = {
  available: "offer",
  checking: "quiet",
  downloading: "quiet",
  verifying: "quiet",
  ready: "ready",
  installing: "quiet",
  failed: "failed",
};

/**
 * The sidebar's update in the card's own states: a download fills the row with the card's gooey
 * ink from the left, verifying and installing wait under the card's beam, and a failure is drained.
 */
export function UpdateRow({ compact }: { compact: boolean }) {
  const update = useAppUpdate();
  const { check, isLoading } = update;
  // One check per launch, after the saved state loads (the store ignores actions before that).
  // A failed check leaves no row, so an offline start stays quiet.
  const checkedOnLaunch = useRef(false);
  useEffect(() => {
    if (isLoading || checkedOnLaunch.current) return;
    checkedOnLaunch.current = true;
    void check();
  }, [isLoading, check]);
  const row = update.navRow;
  if (!row) return null;
  const tone = toneOf[row.phase];
  const failed = tone === "failed";
  const waiting = row.phase === "verifying" || row.phase === "installing";
  return (
    <div {...stylex.props(styles.card, styles[tone])}>
      <button
        type="button"
        title={row.description}
        aria-label={compact ? row.label : failed ? `${row.label}. Try again` : undefined}
        disabled={row.busy}
        onClick={() => void update.runNavRow()}
        {...stylex.props(
          styles.main,
          tone === "ready" && styles.mainReady,
          failed && styles.mainAboveVeil,
          compact && styles.mainCompact,
        )}
      >
        <span
          {...stylex.props(
            styles.icon,
            tone === "offer" && styles.iconOffer,
            tone === "ready" && styles.iconReady,
            failed && styles.iconFailed,
          )}
        >
          <Icon icon={icons[row.phase]} size={15} />
        </span>
        {!compact && (
          <>
            <span data-sidebar-label aria-live="polite" {...stylex.props(styles.label)}>
              {row.label}
            </span>
            {row.detail && (
              <span
                data-sidebar-label
                {...stylex.props(styles.detail, tone === "ready" && styles.detailReady)}
              >
                {row.detail}
              </span>
            )}
            {failed && (
              <span aria-hidden="true" data-sidebar-label {...stylex.props(styles.retry)}>
                <Icon icon={RotateCwIcon} size={12} />
              </span>
            )}
          </>
        )}
      </button>
      {row.phase === "downloading" && (
        // Keyed by width, so a collapsed sidebar gets a canvas sized for its own row.
        <GooLiquid key={compact ? "compact" : "open"} progress={row.progress ?? 0} />
      )}
      {row.phase === "downloading" && !compact && (
        <button
          type="button"
          data-sidebar-label
          aria-label="Cancel download"
          title="Cancel download"
          disabled={update.cancelling}
          onClick={() => void update.cancel()}
          {...stylex.props(styles.cancel)}
        >
          <Icon icon={XIcon} size={12} />
        </button>
      )}
      {waiting && (
        <>
          <Dim corners={radius.control} />
          <Beam label={row.label} corners={radius.control} />
        </>
      )}
      {failed && (
        <>
          <span aria-hidden="true" {...stylex.props(styles.layer, styles.drain)} />
          <span aria-hidden="true" {...stylex.props(styles.layer, styles.veil)} />
        </>
      )}
    </div>
  );
}

const styles = stylex.create({
  card: {
    position: "relative",
    isolation: "isolate",
    display: "flex",
    alignItems: "center",
    height: "34px",
    minWidth: 0,
    borderRadius: radius.control,
    overflow: "hidden",
  },
  quiet: { backgroundColor: color.raised, boxShadow: `inset 0 0 0 1px ${color.borderStrong}` },
  offer: { backgroundColor: "transparent", boxShadow: `inset 0 0 0 1px ${color.borderStrong}` },
  ready: { backgroundColor: color.ink },
  failed: {
    backgroundColor: color.raised,
    boxShadow: `inset 0 0 0 1px ${loadingColor.failedEdge}`,
  },
  main: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingLeft: "18px",
    paddingRight: "12px",
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: color.ink,
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "18px",
    textAlign: "left",
    cursor: { default: "pointer", ":disabled": "progress" },
    transitionProperty: "background-color",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  mainReady: { color: color.surface },
  mainAboveVeil: { position: "relative", zIndex: 1 },
  mainCompact: { justifyContent: "center", paddingLeft: 0, paddingRight: 0 },
  icon: {
    display: "grid",
    placeItems: "center",
    width: "16px",
    flexShrink: 0,
    color: color.ink,
  },
  iconOffer: { color: color.accent },
  iconReady: { color: color.surface },
  iconFailed: { color: color.danger },
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  detail: {
    marginLeft: "auto",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "11px",
    color: color.muted,
  },
  detailReady: { color: color.surface },
  retry: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: "22px",
    height: "22px",
    marginLeft: "auto",
    borderRadius: radius.round,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    backgroundColor: cardColor.tileButton,
    color: color.ink,
  },
  // Above the fill, so it stays readable whether or not ink is under it.
  cancel: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    width: "22px",
    height: "22px",
    flexShrink: 0,
    marginRight: "8px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: cardColor.tileButton,
    color: { default: color.ink, ":hover": color.inkStrong },
    cursor: { default: "pointer", ":disabled": "progress" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  layer: { position: "absolute", inset: 0, pointerEvents: "none" },
  drain: { backgroundColor: loadingColor.failedGrey, mixBlendMode: "saturation" },
  veil: { backgroundColor: loadingColor.failedVeil },
});
