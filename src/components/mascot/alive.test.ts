import { describe, expect, test } from "bun:test";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { SEQUENCE, STATE_BY_ID, type StateId } from "./bot/states";
import { toPoints } from "./bot/shape";
import { RAYON } from "./bot/repere";

function eyeSpread(frame: BotFrame): number {
  const [a, b] = frame.eyes.map((e) => {
    const m = e.matrix.match(/matrix\(([^)]+)\)/)![1]!.split(",").map(Number);
    return { x: m[4]!, y: m[5]! };
  });
  return Math.hypot(a!.x - b!.x, a!.y - b!.y);
}

describe("inkling alive states", () => {
  test("sway, jelly and drift are registered but kept out of the reference montage", () => {
    expect(STATE_BY_ID.has("inkling-sway")).toBe(true);
    expect(STATE_BY_ID.has("inkling-jelly")).toBe(true);
    expect(STATE_BY_ID.has("inkling-drift")).toBe(true);
    expect(SEQUENCE).not.toContain("inkling-sway");
    expect(SEQUENCE).not.toContain("inkling-jelly");
    expect(SEQUENCE).not.toContain("inkling-drift");
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

  test("splash-b twin is registered with matching samples", () => {
    const a = SHAPE_BY_ID.get("inkling-splash")?.radii;
    const b = SHAPE_BY_ID.get("inkling-splash-b")?.radii;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    expect(b).toHaveLength(a!.length);
  });

  test("drift rotates a full turn without NaN and holds eye spacing", () => {
    const engine = new BotEngine(
      RAYON,
      "inkling-drift",
      SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
      EXPRESSION_BY_ID.get("neutre") ?? null,
    );
    expect(SEQUENCE).not.toContain("inkling-drift");
    const frames = [0, 2, 4, 6, 8, 10, 12].map((t) => engine.sample(t));
    for (const frame of frames) {
      expect(frame.bodyPath).not.toContain("NaN");
      expect(frame.eyes.length).toBe(2);
      // Peak-normalized silhouette: constant visual weight at any instant.
      const nums = frame.bodyPath.match(/-?\d+(\.\d+)?/g)!.map(Number);
      for (const n of nums) expect(Math.abs(n)).toBeLessThan(120);
    }
    expect(new Set(frames.map((f) => f.bodyPath)).size).toBeGreaterThan(1);
    // steadyFace: lobes turning underneath must not pump the gaze apart.
    // Natural drift wobble accounts for a few units; the old fit swung ~10+.
    const spreads = frames.map(eyeSpread);
    expect(Math.min(...spreads)).toBeGreaterThan(10);
    expect(Math.max(...spreads) - Math.min(...spreads)).toBeLessThan(8);
  });

  test("splash faces keep breathing room around the eyes", () => {
    // Conservative blanket eye radius (tracks EYE_H x RAYON / 2): real margins
    // read higher. Catches a removed splash bonus or a reverted drift face.
    const radii = SHAPE_BY_ID.get("inkling-splash")?.radii ?? null;
    const contour = toPoints({ radii: radii!, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1 }, RAYON);
    const margin = (state: StateId, t: number): number => {
      const frame = new BotEngine(RAYON, state, radii, EXPRESSION_BY_ID.get("neutre") ?? null).sample(t);
      let m = Infinity;
      for (const eye of frame.eyes) {
        const p = eye.matrix.match(/matrix\(([^)]+)\)/)![1]!.split(",").map(Number);
        for (const q of contour) {
          const d = Math.hypot(q.x - p[4]!, q.y - p[5]!) - 25;
          if (d < m) m = d;
        }
      }
      return m;
    };
    expect(margin("idle", 1.0)).toBeGreaterThan(2);
    expect(margin("inkling-sway", 1.0)).toBeGreaterThan(2);
    expect(margin("inkling-drift", 4.0)).toBeGreaterThan(0);
  });
});
