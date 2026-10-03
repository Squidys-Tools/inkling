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
 * The normalized http(s) URL to hand to the OS, or null when the input is not
 * openable. Source URLs are untrusted input (a saved page, a deep link, an
 * extension payload), and both open paths are dangerous with anything but
 * http(s): `anchor.href` would run a javascript: URL in this window, and the
 * opener plugin would hand `file:` to the shell.
 *
 * `new URL` is the browser's own normalizer, so normalization happens before
 * the protocol check: it drops leading and trailing C0-and-space plus every
 * tab/newline anywhere in the input. `java\nscript:` and `\tjavascript:` are
 * therefore already `javascript:` by the time the protocol is read, which a
 * prefix check on the raw string would miss. Returning `parsed.toString()`
 * also hands the opener plugin the same canonical string the webview would
 * have used, instead of a raw value Rust's URL parser reads differently.
 */
export function openableExternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed.toString();
}

/**
 * Open an external http(s) URL in the system browser.
 * In the Tauri webview navigation and window.open are inert, so route through
 * the opener plugin. Preview uses a detached anchor (same as target=_blank).
 * Returns false, without touching the browser or the shell, when the URL is
 * not an openable http(s) address.
 */
export function openExternalUrl(url: string | null | undefined): boolean {
  const target = openableExternalUrl(url);
  if (!target) return false;
  if (isTauriRuntime()) {
    void invoke("plugin:opener|open_url", { url: target }).catch(() => {
      openInBrowser(target);
    });
    return true;
  }
  openInBrowser(target);
  return true;
}