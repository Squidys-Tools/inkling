import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { buildReadmeMascot, readmeMascotFrame, readmeMascotSvg } from "./readmeMascot";

// The README mascot is a file nobody lints and everybody sees, so what these
// cover is the things that break silently in a browser: a loop that jumps on
// the seam, a mask that stops lining up with the ink, motion that ignores a
// reader who asked for none.

const svg = buildReadmeMascot();

/** Every `@keyframes` block, keyed by name. */
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
    // The body path is the one filled white, and it is the hole cutter.
    expect(mask?.querySelector('path[fill="#fff"]')).not.toBeNull();
    expect(document.querySelector("g[mask] rect")).not.toBeNull();
  });

  test("breathes and blinks on one loop that starts and ends alike", () => {
    const all = blocks();
    expect([...all.keys()].sort()).toEqual(["inkling-blink", "inkling-sway"]);
    for (const frames of all.values()) {
      expect(frames.length).toBeGreaterThan(2);
      expect(frames[0]![0]).toBe("0");
      // A loop whose last keyframe differs from its first jumps once a cycle.
      expect(frames[frames.length - 1]![1]).toBe(frames[0]![1]);
    }
  });

  test("the loop is actually animated rather than a still that says it moves", () => {
    const sway = blocks().get("inkling-sway") ?? [];
    const lids = (blocks().get("inkling-blink") ?? []).map(([, decl]) => decl);
    // The body has to actually travel, and the eyes have to actually close.
    expect(new Set(sway.map(([, decl]) => decl)).size).toBeGreaterThan(2);
    // 0.06 is `blinkScale(0)`: the engine's own floor for a shut eye. A blink
    // that stops short of it reads as a twitch, not a blink.
    expect(lids).toContain("transform:scaleY(0.06)");
    expect(lids.filter((decl) => decl === "transform:scaleY(1)").length).toBeGreaterThan(2);
    expect(style()).toContain("animation:inkling-sway 6s linear infinite");
    expect(style()).toContain("animation:inkling-blink 6s linear infinite");
  });

  test("a reader who asked for reduced motion gets the still, not the loop", () => {
    const css = style();
    const rule = css.match(/@media \(prefers-reduced-motion:reduce\)\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain(".inkling-sway");
    expect(rule).toContain(".inkling-blink");
    expect(rule).toContain("animation:none");
  });

  test("the still the loop rests on is a real frame of the engine", () => {
    const frame = readmeMascotFrame();
    const still = readmeMascotSvg(frame, "#1a1a1a", "#faf9f6");
    expect(still).toContain(frame.bodyPath);
    expect(frame.eyes).toHaveLength(2);
    for (const eye of frame.eyes) {
      expect(still).toContain(eye.d);
      expect(still).toContain(eye.matrix);
    }
  });
});
