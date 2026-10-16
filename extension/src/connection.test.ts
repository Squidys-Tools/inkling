import { describe, expect, test } from "bun:test";
import { randomBytes, randomInt } from "node:crypto";
import { isPairingToken, normalizeCaptureServerAddress } from "./connection";

describe("capture server pairing", () => {
  test("accepts only the app's explicit IPv4 loopback address", () => {
    const loopbackAddress = `http://127.0.0.1:${randomInt(49_152, 65_536)}`;
    expect(normalizeCaptureServerAddress(loopbackAddress)).toBe(loopbackAddress);
    for (const address of [
      loopbackAddress.replace("http:", "https:"),
      loopbackAddress.replace("127.0.0.1", "localhost"),
      loopbackAddress.replace("127.0.0.1", "192.168.1.10"),
      "http://127.0.0.1",
      loopbackAddress.replace("127.0.0.1", "user:example@127.0.0.1"),
      `${loopbackAddress}/v1/captures`,
    ]) {
      expect(normalizeCaptureServerAddress(address)).toBeNull();
    }
  });

  test("accepts the server's alphanumeric pairing token format", () => {
    expect(isPairingToken(randomBytes(32).toString("hex"))).toBe(true);
    expect(isPairingToken("short")).toBe(false);
    expect(isPairingToken("a".repeat(129))).toBe(false);
    expect(isPairingToken("x y".repeat(16))).toBe(false);
  });
});
