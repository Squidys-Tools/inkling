import { describe, expect, test } from "bun:test";
import { BotEngine } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { SEQUENCE, STATE_BY_ID } from "./bot/states";
import { RAYON } from "./bot/repere";

describe("inkling alive states", () => {
  test("sway and jelly are registered but kept out of the reference montage", () => {
    expect(STATE_BY_ID.has("inkling-sway")).toBe(true);
    expect(STATE_BY_ID.has("inkling-jelly")).toBe(true);
    expect(SEQUENCE).not.toContain("inkling-sway");
    expect(SEQUENCE).not.toContain("inkling-jelly");
  });

  test("sway and jelly visibly move the splash body without NaN", () => {
    const radii = SHAPE_BY_ID.get("inkling-splash")?.radii ?? null;
    const expr = EXPRESSION_BY_ID.get("neutre") ?? null;
    for (const state of ["inkling-sway", "inkling-jelly"] as const) {
      const engine = new BotEngine(RAYON, state, radii, expr);
      const frames = [0.5, 1.5, 3.0, 4.5].map((t) => engine.sample(t));
      for (const frame of frames) {
        expect(frame.bodyPath).not.toContain("NaN");
        expect(frame.eyes.length).toBeGreaterThan(0);
      }
      const paths = new Set(frames.map((f) => f.bodyPath));
      expect(paths.size).toBeGreaterThan(1);
    }
  });

  test("splash-b twin is registered and morphs smoothly from splash", () => {
    const a = SHAPE_BY_ID.get("inkling-splash")?.radii;
    const b = SHAPE_BY_ID.get("inkling-splash-b")?.radii;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    expect(b).toHaveLength(a!.length);
    const engine = new BotEngine(RAYON, "idle", a ?? null, EXPRESSION_BY_ID.get("neutre") ?? null);
    engine.setShape(b ?? null, 0);
    const mid = engine.sample(0.2);
    expect(mid.bodyPath).not.toContain("NaN");
    expect(mid.bodyPath).not.toBe(engine.sample(5.0).bodyPath);
  });
});
