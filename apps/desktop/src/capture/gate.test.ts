import { describe, expect, test } from "bun:test";
import {
  bearerToken,
  createRateLimiter,
  extensionOrigin,
  hostAllowed,
  originAllowed,
  tokensEqual,
} from "./gate.ts";

describe("capture server request gate", () => {
  test("bearer tokens require the exact value", () => {
    expect(bearerToken({ authorization: "Bearer abc123" })).toBe("abc123");
    expect(tokensEqual("abc123", "abc123")).toBe(true);
    expect(tokensEqual("abc123", "abc124")).toBe(false);
    expect(tokensEqual("abc123", "abc1234")).toBe(false);
    expect(bearerToken({ authorization: "Basic abc" })).toBeNull();
    expect(bearerToken({})).toBeNull();
  });

  test("only extension, null, and Electron origins pass", () => {
    for (const allowed of [
      undefined,
      "null",
      "chrome-extension://abcdef",
      "moz-extension://1234-uuid",
      "safari-web-extension://com.example.clip",
      "app://local",
      "inkling://capture?url=https://example.com",
    ]) {
      expect(originAllowed(allowed)).toBe(true);
    }
    for (const denied of [
      "https://example.com",
      "http://localhost:3000",
      "http://127.0.0.1:1420",
      "file://",
      "nullified",
      "chrome-extension-fake://x",
      "chrome-extension://abc/path",
    ]) {
      expect(originAllowed(denied)).toBe(false);
    }
  });

  test("pairing takes an extension's origin and nothing a web page can send", () => {
    expect(extensionOrigin("chrome-extension://abcdef")).toBe(true);
    for (const denied of [undefined, "null", "app://local", "https://example.com"])
      expect(extensionOrigin(denied)).toBe(false);
  });

  test("the Host must be the loopback address the receiver listens on", () => {
    expect(hostAllowed("127.0.0.1:17872", 17872)).toBe(true);
    for (const denied of [undefined, "localhost:17872", "rebound.example:17872", "127.0.0.1:1"])
      expect(hostAllowed(denied, 17872)).toBe(false);
  });

  test("the rate limit allows 60 requests a minute", () => {
    let now = 10_000;
    const allowRequest = createRateLimiter(() => now);
    for (let index = 0; index < 60; index += 1) expect(allowRequest()).toBe(true);
    expect(allowRequest()).toBe(false);
    now += 60_000;
    expect(allowRequest()).toBe(true);
  });
});
