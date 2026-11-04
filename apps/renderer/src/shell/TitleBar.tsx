import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
import { layout } from "@inkling/ui/tokens.stylex";
import { desktop, platform, useChromeControls } from "../desktop.ts";
import { useViewState } from "../libraryView/viewState.ts";
import { WindowControls } from "./WindowControls.tsx";

/** The drag band, plus the inset caption pill wherever the app draws its own buttons. */
export function TitleBar() {
  const open = useViewState((state) => state.sidebarOpen);
  const controls = useChromeControls();
  useEffect(() => {
    if (platform === "darwin")
      void desktop?.window.setNativeControlsVisible(controls === "native-left");
  }, [controls]);
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
        <div data-bench="window-controls" {...stylex.props(styles.controls)}>
          <WindowControls actions={desktop.window} />
        </div>
      )}
    </>
  );
}

const styles = stylex.create({
  controls: {
    position: "fixed",
    top: "8px",
    right: "8px",
    WebkitAppRegion: "no-drag",
    zIndex: 40,
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
  customBand: { right: "130px", height: "10px", zIndex: 20 },
  clearSidebar: (left: number) => ({ left }),
  overlay: {
    left: "env(titlebar-area-x, 0px)",
    width: "env(titlebar-area-width, 100%)",
    height: "env(titlebar-area-height, 32px)",
  },
});
