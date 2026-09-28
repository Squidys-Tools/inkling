import { describe, expect, test } from "bun:test";
import {
  getMascotFrame,
  observeMascotFrame,
  pushMascotLook,
  pushMascotParams,
  pushMascotRoamParams,
  sampleMascotAt,
  subscribeMascot,
} from "./mascotStore";

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

  test("unknown expression falls back instead of breaking", () => {
    pushMascotParams({ state: "idle", expression: "nope" });
    const frame = sampleMascotAt(5.0);
    expect(frame.bodyPath.length).toBeGreaterThan(100);
    pushMascotParams({ state: "idle", expression: "neutre" });
  });

  test("roam override and gaze hand the shared engine back cleanly", () => {
    let observed = 0;
    const stopObserving = observeMascotFrame(() => {
      observed += 1;
    });
    pushMascotParams({ state: "inkling-sway", expression: "neutre" });
    pushMascotRoamParams({ state: "inkling-jelly", expression: "curieux" });
    pushMascotLook({ yaw: 18, pitch: -6, mix: 0.8, spin: 0, wander: 0.2 });
    const roaming = sampleMascotAt(5.0);
    expect(roaming.bodyPath).not.toContain("NaN");
    expect(roaming.eyes.length).toBeGreaterThan(0);

    pushMascotRoamParams(null);
    const homed = sampleMascotAt(6.0);
    expect(homed.bodyPath).not.toContain("NaN");
    expect(observed).toBeGreaterThan(0);
    stopObserving();
  });
});
