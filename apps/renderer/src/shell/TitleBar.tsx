import { Cancel01Icon, MinusSignIcon, SquareIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, layout, motion } from "@inkling/ui/tokens.stylex";
import { chrome, desktop } from "../desktop.ts";
import { useViewState } from "../libraryView/viewState.ts";

/** The native caption callbacks, in the library's own resting search-pill glass. */
export function TitleBar() {
  const open = useViewState((state) => state.sidebarOpen);
  if (chrome.controls === "system-frame") return null;
  const custom = chrome.controls === "custom-right";
  return (
    <>
      <div
        aria-hidden="true"
        {...stylex.props(
          styles.band,
          custom && styles.customBand,
          custom && styles.clearSidebar(open ? 248 : 76),
          chrome.controls === "overlay-right" && styles.overlay,
        )}
      />
      {custom && desktop && (
        <div data-bench="caption-reveal" {...stylex.props(styles.reveal)}>
          <Glass aria-label="Window controls" style={styles.controls}>
            <button
              type="button"
              aria-label="Minimize"
              title="Minimize"
              onClick={() => void desktop?.window.minimize()}
              {...stylex.props(styles.control)}
            >
              <span aria-hidden="true" {...stylex.props(styles.icon)}>
                <HugeiconsIcon icon={MinusSignIcon} size={14} />
              </span>
            </button>
            <button
              type="button"
              aria-label="Maximize or restore"
              title="Maximize or restore"
              onClick={() => void desktop?.window.toggleMaximize()}
              {...stylex.props(styles.control)}
            >
              <span aria-hidden="true" {...stylex.props(styles.icon)}>
                <HugeiconsIcon icon={SquareIcon} size={14} />
              </span>
            </button>
            <button
              type="button"
              aria-label="Close window"
              title="Close window"
              onClick={() => void desktop?.window.close()}
              {...stylex.props(styles.control, styles.close)}
            >
              <span aria-hidden="true" {...stylex.props(styles.icon)}>
                <HugeiconsIcon icon={Cancel01Icon} size={14} />
              </span>
            </button>
          </Glass>
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  band: {
    position: "fixed",
    left: 0,
    right: 0,
    top: 0,
    height: layout.titlebar,
    backgroundColor: "transparent",
    WebkitAppRegion: "drag",
    zIndex: 0,
  },
  // The top-right hover corridor is no-drag; the rest of the top strip still drags.
  customBand: { right: "130px", height: "10px", zIndex: 20 },
  clearSidebar: (left: number) => ({ left }),
  overlay: {
    left: "env(titlebar-area-x, 0px)",
    width: "env(titlebar-area-width, 100%)",
    height: "env(titlebar-area-height, 32px)",
  },
  reveal: {
    position: "fixed",
    top: 0,
    right: 0,
    paddingTop: "13px",
    paddingRight: "8px",
    paddingBottom: "10px",
    paddingLeft: "10px",
    // Opacity keeps the real buttons in the Tab order, unlike visibility/display.
    opacity: { default: 0, ":hover": 1, ":focus-within": 1, ":active": 1 },
    transform: {
      default: "translateY(-3px)",
      ":hover": "none",
      ":focus-within": "none",
      ":active": "none",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: { default: "180ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    transitionTimingFunction: motion.enter,
    WebkitAppRegion: "no-drag",
    zIndex: 40,
  },
  controls: {
    display: "flex",
    boxSizing: "border-box",
    height: "34px",
    paddingInline: "4px",
    borderRadius: "17px",
    color: color.ink,
    WebkitAppRegion: "no-drag",
  },
  control: {
    display: "grid",
    placeItems: "center",
    width: "32px",
    height: "100%",
    padding: 0,
    borderWidth: 0,
    borderRadius: "17px",
    color: "inherit",
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    cursor: "default",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-3px",
  },
  icon: { display: "grid", opacity: 0.55 },
  close: { backgroundColor: { default: "transparent", ":hover": color.dangerSoft } },
});
