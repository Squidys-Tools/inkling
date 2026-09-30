import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { STATE_BY_ID } from "./bot/states";
import { RAYON } from "./bot/repere";
import { closedPath, toPoints } from "./bot/shape";
import { buildReadmeMascot, readmeMascotFrame, readmeMascotSvg } from "./readmeMascot";

// The README mascot is a file nobody lints and everybody sees, so what these
// cover is the things that break silently in a browser: a loop that jumps on
// the seam, an outline that never actually changes, motion that ignores a
// reader who asked for none.

const svg = buildReadmeMascot();

/** Every `@keyframes` block, keyed by name, as `[offset, declaration]` pairs. */
function keyframes(css: string): Map<string, Array<[string, string]>> {
  const out = new Map<string, Array<[string, string]>>();
  for (const [, name, body] of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([^@]*)\}/g)) {
    out.set(
      name,
      [...body.matchAll(/([\d.]+)%\s*\{([^}]*)\}/g)].map(([, at, decl]) => [at!, decl!.trim()]),
    );
  }
  return out;
}

const style = () => svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const blocks = () => keyframes(style());

describe("readme mascot svg", () => {
  test("is a standalone document the readme can point an img at", () => {
    expect(svg.startsWith("<svg xmlns=")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("<script");
  });

  test("parses as a document rather than just looking like markup", () => {
    const { document } = parseHTML(svg);
    const root = document.querySelector("svg");
    expect(root).not.toBeNull();
    expect(root?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(root?.getAttribute("viewBox")).toBe("-158 -158 316 316");
    // A reader without CSS still gets the mascot, not an empty box.
    expect(root?.querySelector("mask#inkling path")).not.toBeNull();
  });

  test("cuts the eyes out of the body instead of painting them on top", () => {
    const { document } = parseHTML(svg);
    const mask = document.querySelector("mask#inkling");
    expect(mask?.getAttribute("maskUnits")).toBe("userSpaceOnUse");
    expect(mask?.querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
    expect(mask?.querySelector('path[fill="#fff"]')).not.toBeNull();
    expect(document.querySelector("g[mask] rect")).not.toBeNull();
  });

  test("turns, flickers and blinks, each on one loop", () => {
    const all = blocks();
    expect([...all.keys()].sort()).toEqual(["inkling-blink", "inkling-flicker", "inkling-turn"]);
    for (const frames of all.values()) {
      expect(frames.length).toBeGreaterThan(1);
      expect(frames[0]![0]).toBe("0");
    }
    for (const name of ["inkling-turn", "inkling-flicker", "inkling-blink"]) {
      expect(style()).toContain(`animation:${name} 24s linear infinite`);
    }
  });

  test("every loop closes on itself, so it repeats without a seam", () => {
    const all = blocks();
    // A whole number of turns is its own identity, which is what makes the turn
    // seam-free without baking a duplicated first frame.
    const turn = all.get("inkling-turn") ?? [];
    expect(turn[turn.length - 1]![1]).toContain("rotate(360deg)");
    // The outline and the lid have to land back where they started, and they
    // have to do it on the loop point rather than somewhere before it.
    for (const name of ["inkling-flicker", "inkling-blink"]) {
      const frames = all.get(name) ?? [];
      expect(frames[frames.length - 1]![0]).toBe("100");
      expect(frames[frames.length - 1]![1]).toBe(frames[0]![1]);
    }
  });

  test("the loop is really the drift, not the sway it replaced", () => {
    const flicker = (blocks().get("inkling-flicker") ?? []).map(([, decl]) => decl);
    // Enough outlines that the lobes are actually carried by the path rather
    // than riding a transform, and every one of them distinct bar the loop
    // point, which has to repeat the first for the seam to be provably closed.
    expect(flicker.length).toBeGreaterThanOrEqual(12);
    expect(new Set(flicker).size).toBe(flicker.length - 1);
    // ...and they have to be the drift's lobes, taken from the engine's profile.
    const first = flicker[0]!.match(/path\("([^"]*)"\)/)?.[1] ?? "";
    expect(first.length).toBeGreaterThan(1000);
    const pose = STATE_BY_ID.get("inkling-drift-loop")!.pose(7);
    expect(pose.sil.rot).toBeCloseTo((7 * Math.PI * 2) / 24, 6);
  });

  test("the blink shuts the eye to the engine's own floor", () => {
    const lids = (blocks().get("inkling-blink") ?? []).map(([, decl]) => decl);
    // 0.06 is `blinkScale(0)`. A blink that stops short of it reads as a twitch.
    expect(lids).toContain("transform:scaleY(0.06)");
    // Open, shut, open, then the double three quarters round.
    const shut = lids.filter((d) => d === "transform:scaleY(0.06)").length;
    expect(shut).toBe(3);
  });

  test("a reader who asked for reduced motion gets the still, not the loop", () => {
    const rule = style().match(/@media \(prefers-reduced-motion:reduce\)\{([^}]*)\}/)?.[1] ?? "";
    for (const name of ["inkling-turn", "inkling-flicker", "inkling-blink"]) {
      expect(rule).toContain(`.${name}`);
    }
    expect(rule).toContain("animation:none");
  });

  test("the still the loop rests on is the engine's own, eyes and outline", () => {
    const frame = readmeMascotFrame();
    // The eyes are holes cut from a real frame, not invented here.
    expect(frame.eyes).toHaveLength(2);
    const still = readmeMascotSvg(frame, "#1a1a1a", "#faf9f6", "M0 0Z");
    for (const eye of frame.eyes) {
      expect(still).toContain(eye.d);
      expect(still).toContain(eye.matrix);
    }
    // And the outline is that frame's, so the frozen fallback is the mascot
    // rather than a rough stand-in for it. Compared numerically, because the
    // asset rounds coordinates to save bytes and the engine does not.
    const numbers = (d: string) => (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
    const resting = numbers(blocks().get("inkling-flicker")?.[0]?.[1].match(/path\("([^"]*)"\)/)?.[1] ?? "");
    const engineOutline = numbers(
      closedPath(toPoints({ ...STATE_BY_ID.get("inkling-drift-loop")!.pose(0).sil, rot: 0 }, RAYON)),
    );
    expect(resting.length).toBe(engineOutline.length);
    for (const [i, value] of resting.entries()) {
      // Half a unit is the most rounding to 0.5 can move a coordinate, which is
      // a fiftieth of a pixel at the size the README shows this.
      expect(Math.abs(value - engineOutline[i]!)).toBeLessThanOrEqual(0.25);
    }
  });
});
