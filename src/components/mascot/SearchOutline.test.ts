import { describe, expect, test } from "bun:test";
import { CALM_WAVE, LIVE_WAVE, wavyOutlinePath } from "./SearchOutline";

describe("wavyOutlinePath", () => {
  test("draws a closed smooth path with no NaN", () => {
    for (const o of [CALM_WAVE, LIVE_WAVE]) {
      const d = wavyOutlinePath(1000, 50, 20, 1.0, o);
      expect(d.startsWith("M")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
      expect(d).not.toContain("NaN");
      expect(d.length).toBeGreaterThan(1000);
    }
  });

  test("wave phase moves with time and liveliness changes amplitude", () => {
    const a = wavyOutlinePath(1000, 50, 20, 1.0, CALM_WAVE);
    const b = wavyOutlinePath(1000, 50, 20, 2.0, CALM_WAVE);
    const c = wavyOutlinePath(1000, 50, 20, 1.0, LIVE_WAVE);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
  test("corners stay near the base radius instead of collapsing", () => {
    const d = wavyOutlinePath(1000, 50, 20, 0, CALM_WAVE);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(-4);
    expect(Math.max(...xs)).toBeLessThan(1004);
    expect(Math.min(...ys)).toBeGreaterThan(-4);
    expect(Math.max(...ys)).toBeLessThan(54);
  });

  test("gain 0 is a straight rounded rect, gain 1 waves", () => {
    const flat = wavyOutlinePath(1000, 50, 20, 1.0, LIVE_WAVE, 0);
    const waved = wavyOutlinePath(1000, 50, 20, 1.0, LIVE_WAVE, 1);
    expect(flat).not.toBe(waved);
    const nums = flat.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(-1);
    expect(Math.max(...xs)).toBeLessThan(1001);
    expect(Math.min(...ys)).toBeGreaterThan(-1);
    expect(Math.max(...ys)).toBeLessThan(51);
  });
});
