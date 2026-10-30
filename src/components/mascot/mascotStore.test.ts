import { describe, expect, test } from "bun:test";
import { getMascotFrame, pushMascotParams, sampleMascotAt, subscribeMascot } from "./mascotStore";

describe("mascotStore", () => {
  test("pushing params notifies subscribers even without rAF", () => {
    let calls = 0;
    const unsub = subscribeMascot(() => {
      calls += 1;
    });
    pushMascotParams({ state: "idle", expression: "neutre" });
    expect(calls).toBeGreaterThan(0);
    expect(getMascotFrame().bodyPath.length).toBeGreaterThan(100);
    unsub();
  });

  test("notify state carries its pastille on the splash body", () => {
    pushMascotParams({ state: "notify", expression: "neutre" });
    const frame = sampleMascotAt(5.0);
    expect(frame.notif).not.toBeNull();
    expect(frame.bodyPath).not.toContain("NaN");
    expect(frame.eyes.length).toBeGreaterThan(0);
  });
});
