import type { DesktopBridge, Platform, WindowChrome } from "@inkling/contracts/desktop";

declare global {
  interface Window {
    inkling?: DesktopBridge;
  }
}

/** The preload bridge in the desktop app; undefined in the web preview. */
export const desktop = typeof window === "undefined" ? undefined : window.inkling;

const userAgentPlatform = (): Platform =>
  /Macintosh/.test(navigator.userAgent)
    ? "darwin"
    : /Windows/.test(navigator.userAgent)
      ? "win32"
      : "linux";

export const platform: Platform = desktop?.platform ?? userAgentPlatform();

// The web preview has no window frame to leave room for.
export const chrome: WindowChrome = desktop?.chrome ?? {
  controls: "system-frame",
  titlebarHeight: 32,
  controlsInset: 0,
};
