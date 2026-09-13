import { describe, expect, test } from "bun:test";
import { BotEngine } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { SHAPE_BY_ID, COLOR_BY_ID } from "./bot/skins";
import { PROFILE_SAMPLES } from "./bot/profiles";
import { RAYON } from "./bot/repere";

const INKLING_SHAPES = ["inkling-splash"];

describe("inkling skins", () => {
  test("the Paper blot shape is registered with 64 finite samples", () => {
    for (const id of INKLING_SHAPES) {
      const shape = SHAPE_BY_ID.get(id);
      expect(shape).toBeDefined();
      expect(shape!.radii).toHaveLength(PROFILE_SAMPLES);
      for (const r of shape!.radii) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0.3);
      }
      const peak = Math.max(...shape!.radii);
      expect(peak).toBeGreaterThan(0.99);
      expect(peak).toBeLessThan(1.2);
    }
  });

  test("inkling ink color matches the design token", () => {
    expect(COLOR_BY_ID.get("inkling")?.hex).toBe("#1a1a1a");
  });

  test("engine samples every inkling shape on baseBody states without NaN", () => {
    const expr = EXPRESSION_BY_ID.get("neutre") ?? null;
    for (const id of INKLING_SHAPES) {
      const radii = SHAPE_BY_ID.get(id)?.radii ?? null;
      for (const state of ["idle", "wink", "wide", "notify"] as const) {
        const engine = new BotEngine(RAYON, state, radii, expr);
        const frame = engine.sample(1.0);
        expect(frame.bodyPath.length).toBeGreaterThan(100);
        expect(frame.bodyPath).not.toContain("NaN");
        for (const eye of frame.eyes) {
          expect(eye.matrix).not.toContain("NaN");
        }
      }
    }
  });
});
