import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./libraryApi";

function openInBrowser(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.click();
}

/**
 * Open an external http(s) URL in the system browser.
 * In the Tauri webview navigation and window.open are inert, so route through
 * the opener plugin. Preview uses a detached anchor (same as target=_blank).
 */
export function openExternalUrl(url: string) {
  if (!url) return;
  if (isTauriRuntime()) {
    void invoke("plugin:opener|open_url", { url }).catch(() => {
      openInBrowser(url);
    });
    return;
  }
  openInBrowser(url);
}
