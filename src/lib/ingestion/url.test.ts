import { describe, expect, test } from "bun:test";
import { isWebUrl, safePublicImageUrl } from "./url";

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

  test("isWebUrl accepts only HTTP and HTTPS URLs", () => {
    for (const [value, expected] of [
      ["https://example.com/article", true],
      ["http://example.com/article", true],
      ["javascript:alert(1)", false],
      ["data:text/html;base64,PGI+", false],
      ["file:///tmp/note.txt", false],
      ["ftp://example.com/file", false],
      ["", false],
      ["/relative/path", false],
      ["not a url at all", false],
    ] as const) {
      expect(isWebUrl(value)).toBe(expected);
    }
  });
});
