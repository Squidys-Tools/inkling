import { describe, expect, test } from "bun:test";
import { bearerToken, createRateLimiter, originAllowed, tokensEqual } from "./capture-gate.ts";

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
      "tauri://localhost",
    ]) {
      expect(originAllowed(denied)).toBe(false);
    }
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
