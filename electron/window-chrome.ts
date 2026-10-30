import type { BrowserWindowConstructorOptions } from "electron";

// The preload hands this to the renderer, which draws caption buttons only when it is false.
export const nativeWindowCaptions = process.platform === "darwin";

// macOS keeps its traffic lights, centered in the renderer's 32px titlebar band.
// Elsewhere the renderer owns all three caption buttons: a native overlay competes
// with them, and Linux's hidden titlebar also requests a decoration seam.
export const customWindowChrome = (
  nativeWindowCaptions
    ? { titleBarStyle: "hidden", trafficLightPosition: { x: 12, y: 10 } }
    : {
        frame: false,
        titleBarStyle: process.platform === "linux" ? "default" : "hidden",
        titleBarOverlay: false,
      }
) satisfies BrowserWindowConstructorOptions;
