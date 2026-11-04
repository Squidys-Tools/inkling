import type { DesktopBridge } from "@inkling/contracts/desktop";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import { color, motion } from "@inkling/ui/tokens.stylex";
import { observeMaximized } from "./windowState.ts";

type WindowActions = DesktopBridge["window"];

/** The inset caption pill: Windows and Linux always, macOS when its appearance setting asks. */
export function WindowControls({ actions }: { actions: WindowActions }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => observeMaximized(actions, setMaximized), [actions]);
  return (
    <div role="group" aria-label="Window controls" {...stylex.props(styles.capsule)}>
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void actions.minimize()}
        {...stylex.props(styles.control)}
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          {...stylex.props(styles.glyph)}
        >
          <path d="M1.5 6.5h9" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore window" : "Maximize window"}
        title={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void actions.toggleMaximize()}
        {...stylex.props(styles.control)}
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          {...stylex.props(styles.glyph)}
        >
          {maximized ? (
            <path d="M4 3V1.5h6.5V8H9M1.5 4H8v6.5H1.5z" />
          ) : (
            <rect x="1.5" y="1.5" width="8" height="8" rx="1.25" />
          )}
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close window"
        title="Close window"
        onClick={() => void actions.close()}
        {...stylex.props(styles.control, styles.close)}
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          {...stylex.props(styles.glyph)}
        >
          <path d="m2 2 8 8m0-8-8 8" />
        </svg>
      </button>
    </div>
  );
}

const styles = stylex.create({
  capsule: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    boxSizing: "border-box",
    height: "32px",
    padding: "3px",
    borderRadius: "12px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    backgroundColor: color.raised,
    color: color.ink,
    boxShadow: `inset 0 1px 0 ${color.glassEdge}, 0 4px 12px ${color.shadow}`,
    WebkitAppRegion: "no-drag",
  },
  control: {
    display: "grid",
    placeItems: "center",
    width: "36px",
    height: "24px",
    padding: 0,
    borderWidth: 0,
    borderRadius: "8px",
    color: "inherit",
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayActive,
      ":active": color.borderStrong,
    },
    outline: { default: "none", ":focus-visible": `2px solid ${color.inkStrong}` },
    outlineOffset: "-2px",
    cursor: "default",
    WebkitAppRegion: "no-drag",
    transitionProperty: "background-color, color",
    transitionDuration: motion.micro,
  },
  close: {
    backgroundColor: {
      default: "transparent",
      ":hover": color.captionClose,
      ":active": color.captionClosePressed,
    },
    color: { default: color.ink, ":hover": color.onCaptionClose, ":active": color.onCaptionClose },
  },
  glyph: {
    display: "block",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1,
    pointerEvents: "none",
  },
});
