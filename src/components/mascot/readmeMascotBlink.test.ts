import { describe, expect, test } from "bun:test";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { blinkScale, liveliness } from "./bot/face";
import { LOOP_SECONDS, blocks } from "./readmeMascot.test-helpers";

describe("readme mascot blinks", () => {
  test("blinks at the engine's own rate rather than three times a loop", () => {
    const lids = (blocks().get("inkling-blink") ?? []).map(([, decl]) => decl);
    // 0.06 is `blinkScale(0)`. A blink that stops short of it reads as a twitch,
    // and only lands on it because the trough is searched for exactly: the lid
    // is a V, so a straight line across its corner cuts the chord and sits above
    // the vertex.
    const shut = lids.filter((d) => d === "transform:scaleY(0.06)").length;
    expect(shut).toBeGreaterThanOrEqual(6);
    // Flat open between blinks, and never mid-blink at an instant that is not
    // one of the three that describe it.
    const closed = lids.filter(
      (d) => d !== "transform:scaleY(1)" && d !== "transform:scaleY(0.06)",
    );
    expect(closed).toEqual([]);
    // The cadence is the engine's calendar, so the gaps are irregular the way a
    // real blink rate is. A metronome here is the giveaway that this is a loop
    // rather than a creature.
    const times = lids
      .map((d, i) => (d === "transform:scaleY(0.06)" ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => Number(blocks().get("inkling-blink")?.[i]?.[0] ?? "0") / 100);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(new Set(gaps.map((g) => g.toFixed(1))).size).toBeGreaterThan(1);
  });

  test("the eye is open again almost immediately after each blink", () => {
    // Asserts on gaps, not values: a missing reopen still forms a valid linear ramp
    // to the next blink. Offsets are percentages, so scale them to seconds first.
    const track = (blocks().get("inkling-blink") ?? []).map(([at, decl]) => ({
      t: (Number(at) / 100) * LOOP_SECONDS,
      shut: decl === "transform:scaleY(0.06)",
    }));
    expect(track.filter((k) => k.shut).length).toBeGreaterThanOrEqual(6);

    // Every trough is followed by an open keyframe close enough behind it to be
    // part of the same blink, rather than the next blink's opening edge.
    for (const [i, k] of track.entries()) {
      if (!k.shut) continue;
      const next = track[i + 1];
      expect(next, `a trough at ${k.t} has no reopen keyframe after it`).toBeDefined();
      expect(
        next!.t - k.t,
        `the eye takes ${(next!.t - k.t).toFixed(2)}s to reopen at ${k.t}`,
      ).toBeLessThanOrEqual(0.3);
    }

    // And the consequence: a blink costs a moment, not a beat. Measured the way
    // a browser measures it, by interpolating the track rather than by counting
    // keyframes, so a ramp between two open keyframes still counts as shut time.
    const values = track.map((k) => (k.shut ? 0.06 : 1));
    const at = (t: number) => {
      for (let i = 1; i < track.length; i++) {
        if (t > track[i]!.t) continue;
        const a = track[i - 1]!;
        const b = track[i]!;
        const k = (t - a.t) / (b.t - a.t);
        return (values[i - 1] ?? 1) + ((values[i] ?? 1) - (values[i - 1] ?? 1)) * k;
      }
      return 1;
    };
    const steps = 2000;
    let shutFor = 0;
    for (let i = 0; i < steps; i++) {
      if (at((LOOP_SECONDS * i) / steps) < 0.99) shutFor += LOOP_SECONDS / steps;
    }
    // A real blink rate spends single-digit percent of a loop with the eye shut.
    // The bug above put this near 50%, which is the whole difference between a
    // creature and something that is falling asleep.
    expect(shutFor, `the eye spends ${shutFor.toFixed(2)}s of ${LOOP_SECONDS}s shut`).toBeLessThan(
      LOOP_SECONDS * 0.1,
    );
  });

  test("no blink lands inside an expression change, where it would hide it", () => {
    // A blink mid-morph hides the change half-done. The blink calendar and the
    // score are independent tables that can drift apart.
    const lid = (t: number) => blinkScale(liveliness(t, { wander: 0 }).lid);
    const ids = [...EXPRESSION_BY_ID.keys()];
    expect(ids.length).toBeGreaterThan(0);
    // Read the beats off the shape track: each held expression is a run of
    // keyframes with one `d`, and a change is where it differs.
    const shapes = (blocks().get("inkling-shape-0") ?? []).map(([, decl]) => decl);
    expect(shapes.length).toBeGreaterThan(0);
    // The shape moves only between keyframes that disagree, so those intervals are
    // the morphs, and the lid must stay open across all of them.
    const moving = shapes.filter((d, i) => i > 0 && d !== shapes[i - 1]).length;
    expect(moving).toBeGreaterThanOrEqual(3);
    const times = (blocks().get("inkling-shape-0") ?? []).map(([at]) => (Number(at) / 100) * 24);
    for (let i = 1; i < shapes.length; i++) {
      if (shapes[i] === shapes[i - 1]) continue;
      for (let t = times[i - 1]!; t <= times[i]!; t += 0.01) {
        // Compared against the floor, not against 1: the lid is 1 - eps on the
        // leading edge of a blink, and a blink is only in the way once the eye
        // is actually a line.
        expect(lid(t), `a blink lands inside a morph at t=${t.toFixed(2)}`).toBeGreaterThan(0.5);
      }
    }
  });
});
