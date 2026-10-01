import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { blinkScale, liveliness } from "./bot/face";
import { RAYON } from "./bot/repere";
import { toPoints, type Point } from "./bot/shape";
import { STATE_BY_ID } from "./bot/states";
import { buildReadmeMascot, readmeMascotFrame, readmeMascotSvg } from "./readmeMascot";

// The README mascot is a file nobody lints and everybody sees, so what these
// cover is the things that break silently in a browser: a loop that jumps on
// the seam, an outline that never actually changes, a face that never actually
// changes, an eye that walks off the body mid-turn, and motion that ignores a
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

/** The loop length the keyframe offsets are percentages of. Kept in step with
 *  `LOOP_SECONDS` in the generator; a mismatch here would silently rescale every
 *  threshold expressed in seconds. */
const LOOP_SECONDS = 24;

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
const CLASSES = [
  "inkling-flicker",
  "inkling-blink",
  "inkling-eye-0",
  "inkling-eye-1",
] as const;

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

/** The outline points of a `d:path("...")` body keyframe. M x y, then 64 groups
 *  of six: two control points and the on-curve point. */
function outlinePoints(d: string): Array<[number, number]> {
  const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  const points: Array<[number, number]> = [[n[0]!, n[1]!]];
  for (let i = 2; i + 5 < n.length; i += 6) points.push([n[i + 4]!, n[i + 5]!]);
  return points;
}

/** Half-extents of an eye capsule, either way up.
 *
 * A capsule is a stadium, and the axis it is tall on moves with the expression:
 * `heureux` is wider than tall, most of the rest are the other way round. So the
 * extents come from the extreme `x y` pairs in the path rather than from its
 * opening coordinate.
 *
 * That used to be read off the opening `M` and the first `L` instead, which is
 * the pair at the CAP CENTRE — 13.55 where the cap apex is 24.7. The corners it
 * went on to check were eleven units short of the real ones at the top and bottom
 * of every eye, which is where a lobe meets the body first. The clearance it
 * reported was a third better than the truth.
 */
function capsule(d: string): [number, number] {
  let w = 0;
  let h = 0;
  for (const pair of d.matchAll(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g)) {
    w = Math.max(w, Math.abs(Number(pair[1])));
    h = Math.max(h, Math.abs(Number(pair[2])));
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
    // `animation` is a shorthand: a second declaration on the same element
    // resets every longhand it does not name. The eyes each run a shape track
    // and a look track, and when those were separate rules the look lost, which
    // froze the eye on its t=0 matrix while the shape carried on. The symptom is
    // invisible in the markup and obvious on screen, so it is worth a test.
    const { document } = parseHTML(svg);
    // Only the rules outside the reduced-motion block, which repeats the
    // selectors on purpose to switch them all off at once.
    const rules = style().split("@media")[0]!;
    const selectors = [...rules.matchAll(/\.([\w-]+)\s*\{/g)].map(([, name]) => name!);
    for (const name of CLASSES) {
      const hits = selectors.filter((s) => s === name);
      expect(hits.length, `.${name} is declared ${hits.length} times, so one rule erases the other`).toBe(1);
    }
    // The eye rule names both of its tracks, comma separated, in one shorthand.
    const bodies = new Map([...rules.matchAll(/\.([\w-]+)\{([^}]*)\}/g)].map(([, name, body]) => [name!, body!]));
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
    // Every baked outline has to sit around the middle of the viewBox. A mascot
    // that swings off the page still has a perfectly plausible ink area, so an
    // area check sails straight past it; only its position gives it away. This
    // is the check that was missing when a `rotate()` on the wrong pivot shipped
    // the mascot out of frame.
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
    const closed = lids.filter((d) => d !== "transform:scaleY(1)" && d !== "transform:scaleY(0.06)");
    expect(closed).toEqual([]);
    // The cadence is the engine's calendar, so the gaps are irregular the way a
    // real blink rate is. A metronome here is the giveaway that this is a loop
    // rather than a creature.
    const times = lids
      .map((d, i) => (d === "transform:scaleY(0.06)" ? i : -1))
      .filter((i) => i >= 0)
      .map((i) => Number((blocks().get("inkling-blink")?.[i]?.[0] ?? "0")) / 100);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(new Set(gaps.map((g) => g.toFixed(1))).size).toBeGreaterThan(1);
  });

  test("the eye is open again almost immediately after each blink", () => {
    // The lid keyframes carry three instants per blink: open, shut, open. What
    // separates a blink from a slow squint is the THIRD one, and checking that
    // the trough exists is no proof of it. This once shipped with the reopen
    // missing: a scale had been written into the slot that wants a time, sorted
    // out of order and dropped, so the eye stayed shut until the next blink
    // seconds later. Every other assertion here still passed, because a slow
    // reopen is a valid linear ramp between two real keyframes.
    //
    // So this asserts on the gaps rather than on the values: the eye is fully
    // open for most of the loop, and never shut for more than a blink's worth.
    // Offsets in the stylesheet are percentages of the loop, so they have to be
    // scaled back to seconds before any of the thresholds below mean anything.
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
    // A blink closes the eye to a line. One arriving halfway through a morph
    // covers the change while it is still half-done, so the face appears to
    // snap rather than turn. This is the reason the beats in the script are
    // placed where they are, and it is worth a test because the calendar and the
    // score are two independent tables that can drift apart.
    const lid = (t: number) => blinkScale(liveliness(t, { wander: 0 }).lid);
    const ids = [...EXPRESSION_BY_ID.keys()];
    expect(ids.length).toBeGreaterThan(0);
    // Read the beats off the shape track: each held expression is a run of
    // keyframes with one `d`, and a change is where it differs.
    const shapes = (blocks().get("inkling-shape-0") ?? []).map(([, decl]) => decl);
    expect(shapes.length).toBeGreaterThan(0);
    // The shape only moves between two keyframes that disagree, and that
    // interval IS a morph. The lid has to be open across all of it: a blink
    // arriving halfway covers the change while it is still half-done, so the
    // face appears to snap rather than turn. This is why the beats in the script
    // sit where they do, and it is worth a test because the blink calendar and
    // the score are two independent tables that can drift apart.
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

  test("the eyes stay on the body for the whole loop, which is what fixes the placement", () => {
    // The body turns under a face that is standing still, so a lobe sweeps past
    // the eyes twice a turn. At the app's own gaze the wide-eyed expressions put
    // an eye corner outside the blob entirely; the pinned placement is what
    // keeps the score inside it. Six units at the README's 160px is under three
    // pixels of daylight, which is the margin this leaves.
    //
    // BOTH eyes, because the far one is the one that gets close: it sits lower
    // and outboard of the near one, and on a body rotating under a pinned face
    // that is the corner a lobe reaches first. Checking only `inkling-look-0`
    // reported a margin three times better than the truth.
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
      for (const [i, [at, decl]] of look.entries()) {
        const t = (Number(at) / 100) * 24;
        const poly = toPoints(state.pose(Math.min(t, 24 - 1e-6)).sil, RAYON);
        const matrix = decl.match(/matrix\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
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
        void i;
      }
    }
    expect(worst, `eye ${worstEye} left the body by ${-worst} units at t=${worstAt}`).toBeGreaterThan(6);
  });

  test("the body is the sidebar's own drift, shared rather than copied", () => {
    // This is the whole point of the file, so it is asserted on identity rather
    // than on resemblance: the README mascot and the sidebar mascot must move
    // because they are the same function of time, not because two hand-tuned
    // copies were kept in step.
    //
    // It was two copies once. `inkling-drift-loop` was `inkling-drift` with every
    // period snapped to a divisor of 24 so the state would close on itself — and
    // the loop never needed it, because an SVG `d` track interpolates its last
    // keyframe to the one at 100% anyway. So the README paid for a self-closing
    // state it did not use with a silhouette that recurred every 12s while the
    // body took twice as long to come round, which read as a different mascot.
    //
    // A numeric comparison would pass the next lookalike re-timing. This cannot.
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
    // Since the state does not close on itself, the loop closes on the straight
    // line from the last outline to the one at t=0. That line has to stay about
    // as long as one keyframe interval, because one interval IS one second of the
    // body's turn and the seam is then invisible. Coarsen the grid and it stops
    // being a second of drift and becomes a visible settle — the same bug in new
    // clothes, and the one this file's chord note explains why not to chase.
    const flicker = blocks().get("inkling-flicker") ?? [];
    const last = Number(flicker[flicker.length - 2]![0]);
    const seconds = ((100 - last) / 100) * LOOP_SECONDS;
    expect(seconds, `the closing keyframe is ${seconds.toFixed(2)}s before the loop point`).toBeLessThanOrEqual(1.001);
  });

  test("a reader who asked for reduced motion gets the still, not the loop", () => {
    const rule = style().match(/@media \(prefers-reduced-motion:reduce\)\{([^}]*)\}/)?.[1] ?? "";
    for (const name of CLASSES) {
      expect(rule).toContain(`.${name}`);
    }
    expect(rule).toContain("animation:none");
  });

  test("the still the loop rests on is the engine's own, eyes and outline", () => {    const frame = readmeMascotFrame();
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
