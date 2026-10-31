import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { RAYON } from "./bot/repere";
import { capsulePath, toPoints, type Point } from "./bot/shape";
import { STATE_BY_ID } from "./bot/states";
import { readmeMascotFrame, readmeMascotSvg } from "./readmeMascot";
import { LOOP_SECONDS, blocks, style, svg } from "./readmeMascot.test-helpers";

// Covers what breaks silently in a browser: a seam that jumps, an outline or face
// that never changes, an eye leaving the body mid-turn, and ignored reduced motion.

/** The animation names, which is what a reader of the file is really tracking. */
const TRACKS = [
  "inkling-flicker",
  "inkling-look-0",
  "inkling-look-1",
  "inkling-shape-0",
  "inkling-shape-1",
  "inkling-blink",
] as const;

/** The classes that carry them. An eye drives two tracks from one rule, because
 *  `animation` is a shorthand and a second rule on the same element would wipe
 *  the first — the eye would sit on its t=0 matrix for the whole loop. */
const CLASSES = ["inkling-flicker", "inkling-blink", "inkling-eye-0", "inkling-eye-1"] as const;

/** Area centroid of the on-curve points. A bounding box won't do: the lobes are
 *  asymmetric, so the box's centre wanders while the mascot stands still. */
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

/** The outline points of a `d:path("...")` body keyframe. M x y, then 64 groups
 *  of six: two control points and the on-curve point. */
function outlinePoints(d: string): Array<[number, number]> {
  const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  const points: Array<[number, number]> = [[n[0]!, n[1]!]];
  for (let i = 2; i + 5 < n.length; i += 6) points.push([n[i + 4]!, n[i + 5]!]);
  return points;
}

/** Half-extents of an eye capsule, either way up: its furthest endpoint on each axis.
 *
 * `heureux` is wider than tall and most of the rest are the other way round, so
 * neither axis can be assumed. Each command is read for its own coordinates, so
 * an arc's flags are skipped rather than paired with the number that follows.
 */
function capsule(d: string): [number, number] {
  let w = 0;
  let h = 0;
  for (const [, command, args] of d.matchAll(/([MLA])([^MLAZ]*)/g)) {
    const n = args!
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const [x, y] = command === "A" ? [n[5]!, n[6]!] : [n[0]!, n[1]!];
    w = Math.max(w, Math.abs(x));
    h = Math.max(h, Math.abs(y));
  }
  return [w, h];
}

/** Shortest distance from a point to a closed polygon, and whether it is inside. */
function clearance(poly: Point[], x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k]!;
    const b = poly[(k + 1) % poly.length]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / len2));
    best = Math.min(best, Math.hypot(x - (a.x + u * vx), y - (a.y + u * vy)));
  }
  let inside = false;
  for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
    const a = poly[k]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? best : -best;
}

describe("readme mascot svg", () => {
  test("each part of the mascot runs on its own single loop", () => {
    const all = blocks();
    expect([...all.keys()].sort()).toEqual([...TRACKS].sort());
    for (const frames of all.values()) {
      expect(frames.length).toBeGreaterThan(1);
      expect(frames[0]![0]).toBe("0");
    }
    for (const name of TRACKS) {
      expect(style()).toContain(`${name} ${24}s linear infinite`);
    }
  });

  test("one rule per element, so no track silently overwrites another", () => {
    // Separate `animation` rules reset each other's longhands, freezing the eye on
    // its t=0 matrix. Invisible in markup, obvious on screen.
    const { document } = parseHTML(svg);
    // Only the rules outside the reduced-motion block, which repeats the
    // selectors on purpose to switch them all off at once.
    const rules = style().split("@media")[0]!;
    const selectors = [...rules.matchAll(/\.([\w-]+)\s*\{/g)].map(([, name]) => name!);
    for (const name of CLASSES) {
      const hits = selectors.filter((s) => s === name);
      expect(
        hits.length,
        `.${name} is declared ${hits.length} times, so one rule erases the other`,
      ).toBe(1);
    }
    // The eye rule names both of its tracks, comma separated, in one shorthand.
    const bodies = new Map(
      [...rules.matchAll(/\.([\w-]+)\{([^}]*)\}/g)].map(([, name, body]) => [name!, body!]),
    );
    for (const [eye, look, shape] of [
      ["inkling-eye-0", "inkling-look-0", "inkling-shape-0"],
      ["inkling-eye-1", "inkling-look-1", "inkling-shape-1"],
    ]) {
      const body = bodies.get(eye)!;
      expect(body).toContain(`${look} 24s linear infinite`);
      expect(body).toContain(`${shape} 24s linear infinite`);
      // One shorthand, so one comma between the two tracks.
      expect(body.split("animation:")[1]?.split("}")[0]?.split(",")).toHaveLength(2);
    }
    // And the element really does carry that one class, not the track names.
    for (const path of document.querySelectorAll("g.inkling-blink path")) {
      expect(path.getAttribute("class")).toMatch(/^inkling-eye-[01]$/);
    }
  });

  test("every loop closes on itself, so it repeats without a seam", () => {
    const all = blocks();
    // The outline, the face and the lid all have to land back where they
    // started, and they have to do it on the loop point rather than somewhere
    // before it.
    for (const name of TRACKS) {
      const frames = all.get(name) ?? [];
      expect(frames[frames.length - 1]![0]).toBe("100");
      expect(frames[frames.length - 1]![1]).toBe(frames[0]![1]);
    }
  });

  test("stays in frame for the whole loop, which is the bug this file had once", () => {
    // A mascot swung off the page still has a plausible ink area, so only the
    // outline's position catches it.
    for (const [, decl] of blocks().get("inkling-flicker") ?? []) {
      const points = outlinePoints(decl.match(/path\("([^"]*)"\)/)?.[1] ?? "");
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

  test("the face actually changes, and comes back to where it started", () => {
    // A README mascot frozen on one expression is the thing this replaced, so
    // the shape track has to hold more than one capsule and the transform track
    // more than one place to look from.
    for (const eye of [0, 1]) {
      const shapes = new Set((blocks().get(`inkling-shape-${eye}`) ?? []).map(([, d]) => d));
      expect(shapes.size).toBeGreaterThanOrEqual(4);
      const looks = new Set((blocks().get(`inkling-look-${eye}`) ?? []).map(([, d]) => d));
      expect(looks.size).toBeGreaterThan(20);
    }
  });

  test("capsule() measures a wide eye and a tall one on the right axes", () => {
    expect(capsule(capsulePath(27, 17))).toEqual([13.5, 8.5]);
    expect(capsule(capsulePath(17, 27))).toEqual([8.5, 13.5]);
  });

  test("the eyes stay on the body for the whole loop, which is what fixes the placement", () => {
    // A lobe sweeps past the steady face twice a turn. Both eyes are checked: the
    // far eye sits lower and outboard, so a lobe reaches it first.
    const state = STATE_BY_ID.get("inkling-drift-faced")!;
    let worst = Infinity;
    let worstAt = 0;
    let worstEye = 0;
    for (const eye of [0, 1]) {
      const look = blocks().get(`inkling-look-${eye}`) ?? [];
      const holds = (blocks().get(`inkling-shape-${eye}`) ?? []).map(([at, d]) => ({
        at: (Number(at) / 100) * 24,
        d,
      }));
      for (const [at, decl] of look) {
        const t = (Number(at) / 100) * 24;
        const poly = toPoints(state.pose(Math.min(t, 24 - 1e-6)).sil, RAYON);
        const matrix = decl.match(
          /matrix\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/,
        );
        if (!matrix) continue;
        const [, a, b, c, d, tx, ty] = matrix.map(Number) as unknown as number[];
        // The capsule this keyframe belongs to: the shape held at that instant.
        const held = [...holds].reverse().find((h) => h.at <= t + 1e-6) ?? holds[0]!;
        const [w, h] = capsule(held.d);
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const lx = w * sx;
          const ly = h * sy;
          const gap = clearance(poly, a! * lx + c! * ly + tx!, b! * lx + d! * ly + ty!);
          if (gap < worst) {
            worst = gap;
            worstAt = t;
            worstEye = eye;
          }
        }
      }
    }
    expect(
      worst,
      `eye ${worstEye} left the body by ${-worst} units at t=${worstAt}`,
    ).toBeGreaterThan(6);
  });

  test("the body is the sidebar's own drift, shared rather than copied", () => {
    // Asserted on identity, not resemblance: the README and sidebar mascots must be
    // the same function of time, so a lookalike re-timing can't pass.
    const sidebar = STATE_BY_ID.get("inkling-drift");
    const readme = STATE_BY_ID.get("inkling-drift-faced");
    expect(sidebar).toBeDefined();
    expect(readme).toBeDefined();
    expect(readme!.pose).toBe(sidebar!.pose);
    // And the one thing that may differ is the flag the README needs: drift
    // carries its own face, so only the faced variant accepts an expression.
    expect(sidebar!.baseFace).toBe(false);
    expect(readme!.baseFace).toBe(true);
  });

  test("the seam stays one keyframe long, which is what pays for the loop", () => {
    // The seam is the straight line from the last outline back to t=0, and it must
    // stay about one keyframe interval long or it reads as a visible settle.
    const flicker = blocks().get("inkling-flicker") ?? [];
    const last = Number(flicker[flicker.length - 2]![0]);
    const seconds = ((100 - last) / 100) * LOOP_SECONDS;
    expect(
      seconds,
      `the closing keyframe is ${seconds.toFixed(2)}s before the loop point`,
    ).toBeLessThanOrEqual(1.001);
  });

  test("a reader who asked for reduced motion gets the still, not the loop", () => {
    const rule = style().match(/@media \(prefers-reduced-motion:reduce\)\{([^}]*)\}/)?.[1] ?? "";
    for (const name of CLASSES) {
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
    const resting = numbers(
      blocks()
        .get("inkling-flicker")?.[0]?.[1]
        .match(/path\("([^"]*)"\)/)?.[1] ?? "",
    );
    const engineOutline = numbers(frame.bodyPath);
    expect(resting.length).toBe(engineOutline.length);
    for (const [i, value] of resting.entries()) {
      // Half a unit is the most rounding to 0.5 can move a coordinate, which is
      // a fiftieth of a pixel at the size the README shows this.
      expect(Math.abs(value - engineOutline[i]!)).toBeLessThanOrEqual(0.25);
    }
  });
});
