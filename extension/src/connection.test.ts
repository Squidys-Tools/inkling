import { describe, expect, test } from "bun:test";
import { captureReceiverPorts } from "@inkling/contracts/capture";
import { randomBytes } from "node:crypto";
import { isPairingToken, portsToTry } from "./connection";

describe("capture server pairing", () => {
  test("tries the port that last answered first, and never one outside the app's list", () => {
    const [first, second, third] = captureReceiverPorts;
    expect(portsToTry(second)).toEqual([second, first, third]);
    for (const stored of [undefined, "17872", 80])
      expect(portsToTry(stored)).toEqual(captureReceiverPorts);
  });

  test("accepts the server's alphanumeric pairing token format", () => {
    expect(isPairingToken(randomBytes(32).toString("hex"))).toBe(true);
    expect(isPairingToken("short")).toBe(false);
    expect(isPairingToken("a".repeat(129))).toBe(false);
    expect(isPairingToken("x y".repeat(16))).toBe(false);
  });
});
