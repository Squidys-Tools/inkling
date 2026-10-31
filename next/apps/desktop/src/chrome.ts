import type { Platform, WindowChrome } from "@inkling/contracts/desktop";
import type { BrowserWindowConstructorOptions } from "electron";

// Same value as `color.window` in packages/ui/src/tokens.stylex.ts; change both.
// The window paints it before the first frame, so a resize never flashes white.
export const windowBackground = "#0c0c0b";
const titlebarHeight = 32;

/**
 * Each OS draws its own caption buttons; the renderer only leaves room for them.
 * macOS keeps the traffic lights, centred in the titlebar band. Windows and
 * Linux get the Window Controls Overlay: the real buttons, with Snap Layouts on
 * Windows 11, over a band the renderer draws in the same color.
 */
export function windowChrome(platform: Platform): {
  chrome: WindowChrome;
  options: BrowserWindowConstructorOptions;
} {
  if (platform === "darwin")
    return {
      chrome: { controls: "native-left", titlebarHeight, controlsInset: 76 },
      options: { titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 10 } },
    };
  return {
    chrome: { controls: "overlay-right", titlebarHeight, controlsInset: 138 },
    options: {
      titleBarStyle: "hidden",
      titleBarOverlay: { color: windowBackground, symbolColor: "#c9c1b6", height: titlebarHeight },
    },
  };
}
