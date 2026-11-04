import type { Platform, WindowChrome } from "@inkling/contracts/desktop";
import type { BrowserWindowConstructorOptions } from "electron";

// Same value as color.window; the window paints it before the renderer's first frame.
export const windowBackground = "#0c0c0b";
const titlebarHeight = 32;

/** macOS keeps its traffic lights; Windows and Linux draw their own controls. */
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
    chrome: { controls: "custom-right", titlebarHeight, controlsInset: 138 },
    options: { frame: false },
  };
}
