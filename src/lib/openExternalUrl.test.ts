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
});