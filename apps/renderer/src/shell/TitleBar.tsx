import * as stylex from "@stylexjs/stylex";
import { color, layout } from "@inkling/ui/tokens.stylex";
import { chrome } from "../desktop.ts";

/**
 * The draggable band across the top of the window. The OS draws the caption
 * buttons (traffic lights on the left on macOS, the Window Controls Overlay on
 * the right elsewhere); the band only keeps clear of them.
 */
export function TitleBar() {
  if (chrome.controls === "system-frame") return null;
  return (
    <div {...stylex.props(styles.band, chrome.controls === "overlay-right" && styles.overlay)} />
  );
}

const styles = stylex.create({
  band: {
    position: "fixed",
    insetInline: 0,
    top: 0,
    height: layout.titlebar,
    backgroundColor: color.window,
    WebkitAppRegion: "drag",
    zIndex: 0,
  },
  // The overlay reports its own geometry, so the band ends where the buttons begin.
  overlay: {
    left: "env(titlebar-area-x, 0px)",
    width: "env(titlebar-area-width, 100%)",
    height: "env(titlebar-area-height, 32px)",
  },
});
