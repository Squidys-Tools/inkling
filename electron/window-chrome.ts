import type { BrowserWindowConstructorOptions } from "electron";

// The renderer already owns all three caption buttons. A native overlay
// competes with them; Linux's hidden titlebar also requests a decoration seam.
export const customWindowChrome = {
  frame: false,
  titleBarStyle: process.platform === "linux" ? "default" : "hidden",
  titleBarOverlay: false,
} satisfies BrowserWindowConstructorOptions;
