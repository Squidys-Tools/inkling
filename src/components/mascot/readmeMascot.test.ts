import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
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

/** Area centroid of a closed polygon given its on-curve points. The blob is a
 *  closed path of cubic segments, and the on-curve points trace it, so this is
 *  where the ink actually sits. A bounding box cannot answer that: the mascot's
 *  lobes are not symmetric left to right, so the box's centre wanders while the
 *  mascot stands perfectly still. */
function centroid(points: Array<[number, number]>): [number, number] {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (const [i, [px, py]] of points.entries()) {
    const [qx, qy] = points[(i + 1) % points.length]!;
    const cross = px * qy - qx * py;
    twiceArea += cross;
    x += (px + qx) * cross;
    y += (py + qy) * cross;
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

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
    expect([...all.keys()].sort()).toEqual(["inkling-blink", "inkling-flicker"]);
    for (const frames of all.values()) {
      expect(frames.length).toBeGreaterThan(1);
      expect(frames[0]![0]).toBe("0");
    }
    for (const name of ["inkling-flicker", "inkling-blink"]) {
      expect(style()).toContain(`animation:${name} 24s linear infinite`);
    }
  });

  test("every loop closes on itself, so it repeats without a seam", () => {
    const all = blocks();
    // The outline and the lid have to land back where they started, and they
    // have to do it on the loop point rather than somewhere before it.
    for (const name of ["inkling-flicker", "inkling-blink"]) {
      const frames = all.get(name) ?? [];
      expect(frames[frames.length - 1]![0]).toBe("100");
      expect(frames[frames.length - 1]![1]).toBe(frames[0]![1]);
    }
  });

  test("stays in frame for the whole loop, which is the bug this file had once", () => {
    // Every baked outline has to sit around the middle of the viewBox. A mascot
    // that swings off the page still has a perfectly plausible ink area, so an
    // area check sails straight past it; only its position gives it away. This
    // is the check that was missing when a `rotate()` on the wrong pivot shipped
    // the mascot out of frame.
    for (const [, decl] of blocks().get("inkling-flicker") ?? []) {
      const d = decl.match(/path\("([^"]*)"\)/)?.[1] ?? "";
      // M x y, then 64 groups of six: two control points and the on-curve point.
      const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
      const points: Array<[number, number]> = [[n[0]!, n[1]!]];
      for (let i = 2; i + 5 < n.length; i += 6) points.push([n[i + 4]!, n[i + 5]!]);
      const [cx, cy] = centroid(points);
      // The blob is built on a circle at the origin, so its area centroid sits
      // on the origin to within a lobe's worth of asymmetry.
      expect(Math.hypot(cx, cy)).toBeLessThan(4);
      // And no single point may reach the viewBox edge, or the mask would crop
      // the mascot rather than the background.
      for (const [x, y] of points) {
        expect(Math.abs(x)).toBeLessThan(158);
        expect(Math.abs(y)).toBeLessThan(158);
      }
    }
  });

  test("the turn is baked into the path, not hung off a transform origin", () => {
    // `transform-box: view-box` with a percentage origin is the ambiguous
    // pairing that sent the mascot off screen, so there must be no such rule
    // left, and no `rotate(` anywhere in the file.
    expect(style()).not.toContain("transform-box:view-box");
    expect(style()).not.toContain("rotate(");
    // The turn really is in the outlines: no two a quarter turn apart share one.
    const flicker = (blocks().get("inkling-flicker") ?? []).map(([, decl]) => decl);
    const at = (t: number) => flicker[Math.round((t / 24) * (flicker.length - 1))];
    expect(at(0)).not.toBe(at(6));
    expect(at(0)).not.toBe(at(12));
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
    for (const name of ["inkling-flicker", "inkling-blink"]) {
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
    const engineOutline = numbers(frame.bodyPath);
    expect(resting.length).toBe(engineOutline.length);
    for (const [i, value] of resting.entries()) {
      // Half a unit is the most rounding to 0.5 can move a coordinate, which is
      // a fiftieth of a pixel at the size the README shows this.
      expect(Math.abs(value - engineOutline[i]!)).toBeLessThanOrEqual(0.25);
    }
  });
});
