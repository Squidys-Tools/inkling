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
    // Public addresses that sit next to reserved ranges.
    for (const host of [
      "192.0.1.1",
      "192.2.1.1",
      "198.20.0.1",
      "198.51.1.1",
      "203.0.1.1",
      "8.8.8.8",
      "[2606:4700:4700::1111]",
      "[::ffff:8.8.8.8]",
    ]) {
      expect(tryParseHttpUrl(`http://${host}/`)).not.toBeNull();
    }
    for (const value of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:password@example.com/",
      "http://localhost/",
      "http://0.0.0.0/",
      "http://10.1.2.3/",
      "http://100.64.0.1/",
      "http://127.0.0.1/",
      "http://0x7f.1/",
      "http://169.254.169.254/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://192.0.0.1/",
      "http://192.0.2.1/",
      "http://198.18.0.1/",
      "http://198.51.100.1/",
      "http://203.0.113.1/",
      "http://224.0.0.1/",
      "http://240.0.0.1/",
      "http://255.255.255.255/",
      "http://[::]/",
      "http://[::1]/",
      "http://[fc00::1]/",
      "http://[fd12:3456::1]/",
      "http://[fe80::1]/",
      "http://[ff02::1]/",
      "http://[2001:db8::1]/",
      "http://[64:ff9b::7f00:1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[::127.0.0.1]/",
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
