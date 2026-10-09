import { describe, expect, test } from "bun:test";
import { openExternalUrl, openableExternalUrl } from "./openExternalUrl";

// A saved page, a deep link, or an extension payload can carry any sourceUrl.
// These are the strings that must never reach anchor.href or the shell.
const REJECTED = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "java\nscript:alert(1)",
  "java\rscript:alert(1)",
  "\tjavascript:alert(1)",
  "   javascript:alert(1)",
  "java\u0000script:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///C:/Windows/win.ini",
  "chrome://settings",
  "about:blank",
  "blob:https://example.com/uuid",
  "mailto:someone@example.com",
  "not a url",
  "//example.com/no-scheme",
  "",
];

describe("openableExternalUrl", () => {
  test("rejects every scheme that is not http(s)", () => {
    for (const url of REJECTED) {
      expect(openableExternalUrl(url)).toBeNull();
    }
  });

  test("accepts http(s) and returns the canonical form", () => {
    expect(openableExternalUrl("https://example.com/article")).toBe("https://example.com/article");
    expect(openableExternalUrl("http://example.com/a?b=1#section")).toBe("http://example.com/a?b=1#section");
    expect(openableExternalUrl("HtTpS://Example.COM/x")).toBe("https://example.com/x");
    expect(openableExternalUrl("  https://example.com/padded  ")).toBe("https://example.com/padded");
    expect(openableExternalUrl("https://example.com")).toBe("https://example.com/");
  });

  test("rejects a missing value", () => {
    expect(openableExternalUrl(undefined)).toBeNull();
    expect(openableExternalUrl(null)).toBeNull();
  });

  test("rejects credential-bearing URLs the browser would send on", () => {
    // A saved source URL is untrusted stored metadata, and the system browser
    // would hand these credentials to whatever host is named.
    for (const url of [
      "https://user:pass@example.com/article",
      "https://user@example.com/article",
    ]) {
      expect(openableExternalUrl(url)).toBeNull();
    }
  });
});

describe("openExternalUrl", () => {
  // Rejection happens before any document or bridge access, so this runs in a
  // DOM-less test runner: a refused URL must not have opened anything.
  test("a refused URL is a no-op", () => {
    for (const url of REJECTED) {
      expect(openExternalUrl(url)).toBe(false);
    }
    expect(openExternalUrl(undefined)).toBe(false);
  });

  // The anchor is the Preview route, not a fallback. In the Tauri webview
  // navigation and window.open are inert, so an anchor there would report
  // success while nothing opened; the Tauri branch therefore has no fallback
  // and swallows its own failure rather than pretending. This test exists so
  // the next reader does not re-add one.
  test("preview opens through an anchor, and only preview", () => {
    const clicked: string[] = [];
    const originalDocument = globalThis.document;
    const host = globalThis as unknown as Record<string, unknown>;
    // `isTauriRuntime` reads window.__TAURI_INTERNALS__, an ambient global other
    // suites in this run may have set, so the runtime is pinned explicitly here
    // rather than assumed.
    const hadTauri = "__TAURI_INTERNALS__" in host;
    // Captured, not defaulted: another suite in this run may have installed a
    // real bridge stub, and restoring `{}` here would clobber it.
    const priorTauriGlobal = host.__TAURI_INTERNALS__;
    delete host.__TAURI_INTERNALS__;
    const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
    const hadTauriOnWindow = typeof win === "object" && win !== null && "__TAURI_INTERNALS__" in win;
    const priorTauriWindow = typeof win === "object" && win !== null ? win.__TAURI_INTERNALS__ : undefined;
    if (typeof win === "object" && win !== null) delete win.__TAURI_INTERNALS__;
    host.document = {
      createElement: () => ({
        href: "",
        target: "",
        rel: "",
        click(this: { href: string }) {
          clicked.push(this.href);
        },
      }),
    };
    try {
      expect(openExternalUrl("https://example.com/article")).toBe(true);
      expect(
        clicked,
        "preview must activate the anchor rather than only construct it",
      ).toEqual(["https://example.com/article"]);
    } finally {
      if (hadTauri) host.__TAURI_INTERNALS__ = priorTauriGlobal;
      if (hadTauriOnWindow && typeof win === "object" && win !== null) win.__TAURI_INTERNALS__ = priorTauriWindow;
      if (originalDocument === undefined) {
        delete host.document;
      } else {
        host.document = originalDocument;
      }
    }
  });
});