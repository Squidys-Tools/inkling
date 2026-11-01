import * as stylex from "@stylexjs/stylex";
import { color, font, layout } from "@inkling/ui/tokens.stylex";
import { chrome, desktop } from "../desktop.ts";
import { useViewState } from "../libraryView/viewState.ts";

/** The old app's three caption buttons; native macOS traffic lights stay untouched. */
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
          custom && open && styles.clearSidebar,
          chrome.controls === "overlay-right" && styles.overlay,
        )}
      />
      {custom && desktop && (
        <div aria-label="Window controls" {...stylex.props(styles.controls)}>
          <button
            type="button"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => void desktop.window.minimize()}
            {...stylex.props(styles.control)}
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            aria-label="Maximize or restore"
            title="Maximize or restore"
            onClick={() => void desktop.window.toggleMaximize()}
            {...stylex.props(styles.control)}
          >
            <span aria-hidden="true">□</span>
          </button>
          <button
            type="button"
            aria-label="Close window"
            title="Close window"
            onClick={() => void desktop.window.close()}
            {...stylex.props(styles.control, styles.close)}
          >
            <span aria-hidden="true">×</span>
          </button>
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
  // No paint over the frame's border, and no drag hit area over the buttons or mascot.
  customBand: { right: "138px", zIndex: 20 },
  clearSidebar: { left: "248px" },
  overlay: {
    left: "env(titlebar-area-x, 0px)",
    width: "env(titlebar-area-width, 100%)",
    height: "env(titlebar-area-height, 32px)",
  },
  controls: {
    position: "fixed",
    top: 0,
    right: 0,
    display: "flex",
    height: layout.titlebar,
    WebkitAppRegion: "no-drag",
    zIndex: 40,
  },
  control: {
    display: "grid",
    placeItems: "center",
    width: "46px",
    height: "100%",
    padding: 0,
    borderWidth: 0,
    borderRadius: 0,
    fontFamily: font.body,
    fontSize: "15px",
    color: { default: color.muted, ":hover": color.ink },
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    cursor: "default",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-3px",
  },
  close: {
    color: { default: color.muted, ":hover": color.inkStrong },
    backgroundColor: { default: "transparent", ":hover": color.dangerSoft },
  },
});
