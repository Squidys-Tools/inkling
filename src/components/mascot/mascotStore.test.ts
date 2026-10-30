import { describe, expect, test } from "bun:test";
import { getMascotFrame, pushMascotParams, subscribeMascot } from "./mascotStore";

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
});
