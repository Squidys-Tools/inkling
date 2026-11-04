import * as stylex from "@stylexjs/stylex";
import { layout, motion } from "@inkling/ui/tokens.stylex";
import { chrome, desktop } from "../desktop.ts";
import { useViewState } from "../libraryView/viewState.ts";
import { useAppearance } from "../settings/appearance.ts";
import { WindowControls } from "./WindowControls.tsx";

/** The drag band, plus the inset caption pill wherever the app draws its own buttons. */
export function TitleBar() {
  const open = useViewState((state) => state.sidebarOpen);
  const { windowControlsAtRest } = useAppearance();
  const controls = chrome.controls;
  if (controls === "system-frame") return null;
  const custom = controls === "custom-right";
  return (
    <>
      <div
        aria-hidden="true"
        {...stylex.props(
          styles.band,
          custom && styles.customBand,
          custom && styles.clearSidebar(open ? 248 : 76),
          controls === "overlay-right" && styles.overlay,
        )}
      />
      {custom && desktop && (
        <div
          data-bench="window-controls"
          {...stylex.props(styles.controls, windowControlsAtRest === "hover" && styles.reveal)}
        >
          <WindowControls actions={desktop.window} />
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  controls: {
    position: "fixed",
    top: "13px",
    right: "13px",
    WebkitAppRegion: "no-drag",
    zIndex: 40,
  },
  // Opacity keeps the buttons in the Tab order, unlike visibility or display.
  reveal: {
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
  },
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
  // The top-right caption pill is no-drag; the band stops short of it.
  customBand: { right: "135px", height: "10px", zIndex: 20 },
  clearSidebar: (left: number) => ({ left }),
  overlay: {
    left: "env(titlebar-area-x, 0px)",
    width: "env(titlebar-area-width, 100%)",
    height: "env(titlebar-area-height, 32px)",
  },
});
