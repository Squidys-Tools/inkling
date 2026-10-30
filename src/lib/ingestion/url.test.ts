import { describe, expect, test } from "bun:test";
import { isWebUrl, safePublicImageUrl, tryParseHttpUrl } from "./url";

describe("URL helpers", () => {
  test("normalizes public HTTP images and rejects private hosts", () => {
    expect(safePublicImageUrl("https://example.com/image.jpg")).toBe(
      "https://example.com/image.jpg",
    );
    for (const value of [
      "http://127.0.0.1/image.jpg",
      "http://[::1]/image.jpg",
      "https://192.168.1.4/image.jpg",
      "https://photos.local/image.jpg",
      "https://photos.internal/image.jpg",
      "file:///tmp/image.jpg",
      "https://user:password@example.com/image.jpg",
    ]) {
      expect(safePublicImageUrl(value)).toBeUndefined();
    }
  });

  test("tryParseHttpUrl saves a bare host as https and refuses unsafe targets", () => {
    expect(tryParseHttpUrl("example.com/path")?.toString()).toBe("https://example.com/path");
    expect(tryParseHttpUrl("http://localhost/", { allowPrivateNetwork: true })?.toString()).toBe(
      "http://localhost/",
    );
    for (const value of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:password@example.com/",
      "http://localhost/",
    ]) {
      expect(tryParseHttpUrl(value)).toBeNull();
    }
  });

  test("isWebUrl accepts only HTTP and HTTPS URLs", () => {
    for (const [value, expected] of [
      ["https://example.com/article", true],
      ["http://example.com/article", true],
      ["javascript:alert(1)", false],
      ["data:text/html;base64,PGI+", false],
      ["file:///tmp/note.txt", false],
      ["vbscript:msgbox(1)", false],
      ["ftp://example.com/file", false],
      ["", false],
      ["   ", false],
      ["example.com", false],
      ["/relative/path", false],
      ["not a url at all", false],
    ] as const) {
      expect(isWebUrl(value)).toBe(expected);
    }
  });
});
