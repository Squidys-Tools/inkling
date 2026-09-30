import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { blinkScale, liveliness } from "./bot/face";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";

/**
 * The mascot as a looping standalone SVG, for the README.
 *
 * GitHub renders an SVG referenced from an `<img>` as a document with CSS and
 * no script, so keyframes inside it run and nothing else has to change.
 *
 * The whole turn AND the lobe drift are baked into `d` keyframes, off the
 * engine's own body path, and nothing is rotated with a CSS transform.
 *
 * That is not the obvious way to do it. A rigid turn looks like exactly the
 * kind of thing `rotate()` is for, and an earlier version of this file used it
 * and shipped the mascot flying off the page. `transform-box: view-box` with
 * `transform-origin: 50% 50%` is the way to say "about the middle of the
 * viewBox", but the spec is ambiguous about where the viewBox's reference box
 * actually starts, engines do not agree, and getting it wrong puts the pivot
 * at (158, 158) instead of (0, 0). The mascot is then 223 units from its own
 * pivot and swings clean out of frame. A baked path has no pivot to get wrong.
 *
 * What baking does cost is the chord: two outlines a step apart interpolate
 * along a straight line, so the shape sits on the chord rather than the arc and
 * shrinks by `1 - cos(step/2)` at each midpoint. One outline per second is a
 * 15 degree step, 0.86% at the midpoint, which is under half a pixel on the
 * 160px the README draws it at.
 */

/** One full turn, matching `inkling-drift-loop`'s 24 s rotation period. */
const LOOP_SECONDS = 24;

/** One baked outline per second. See the chord note above for why not coarser. */
const FLICKER_STEP_SECONDS = 1;

/** Where the engine blinks again three quarters of the way round, and how long
 *  one lid takes, so the second of the pair follows the first. */
const DOUBLE_AT = (LOOP_SECONDS * 3) / 4;

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

const pct = (t: number) => r4((100 * t) / LOOP_SECONDS);

/** Half a unit. The outline is 316 units across and the README shows it at
 *  160px, so this is a fiftieth of a pixel there. */
const path1 = (d: string) => d.replace(/-?\d+\.?\d*/g, (m) => String(Math.round(Number(m) * 2) / 2));

/** The loop's outline at t, turned and reshaped, straight from the engine.
 *
 *  `inkling-drift-loop` sets `steadyFace`, so its eyes are pinned to a fixed
 *  gaze and do not travel with the turn. Only the body moves, and this is its
 *  path, which is what the sidebar is drawing at the same instant.
 *
 *  A fresh engine per sample on purpose: the state changes at t=0, so a sample
 *  is always at or after that change and no morph is ever in flight.
 */
function outlineAt(t: number): string {
  return new BotEngine(
    RAYON,
    "inkling-drift-loop",
    null,
    EXPRESSION_BY_ID.get("neutre") ?? null,
  ).sample(t).bodyPath;
}

/**
 * The engine's first blink, reduced to the three instants that matter: open,
 * shut, open again. The lid curve is a triangle in the engine, so a browser
 * interpolating linearly between these three reproduces it exactly, where a
 * sample grid spread over the same event rounds the trough off and leaves the
 * eye never quite shut.
 */
function blinkShape(): { at: number; shut: number; closed: number } {
  const lid = (t: number) => blinkScale(liveliness(t, { wander: 0 }).lid);
  const step = 0.001;

  let at = 0;
  while (lid(at) === 1) at += step;
  let end = at;
  while (lid(end) < 1) end += step;

  // The trough sits between two samples either side of it. Interpolating
  // across the bracket puts it to well under a millisecond.
  let shut = at;
  let closed = 1;
  for (let t = at; t <= end; t += step) {
    const value = lid(t);
    if (value >= closed) continue;
    const before = lid(t - step);
    const after = lid(Math.min(end, t + step));
    const k = before - after === 0 ? 0.5 : (before - value) / (before - after);
    shut = t - step + k * step;
    closed = value;
  }
  return { at, shut, closed };
}

/** `@keyframes` for the body: the loop point included, holding the same
 *  outline the first frame holds, so the browser interpolates nothing across
 *  the seam and the repeat is provably continuous.
 *
 *  The loop point is the *first* outline pasted back in, not a sample at
 *  t=24. The engine's state has length 24s, so `sample(24)` has already
 *  crossed into the next state and is a different pose; a keyframe taken there
 *  would put a visible jump at exactly the moment the animation is supposed to
 *  be invisible. The pose at 24s is the pose at 0s by construction, so the
 *  first outline is the honest value for both. */
function flickerKeyframes(): string {
  const steps = Math.round(LOOP_SECONDS / FLICKER_STEP_SECONDS);
  const frames: string[] = [];
  for (let i = 0; i < steps; i++) {
    frames.push(`${pct((LOOP_SECONDS * i) / steps)}%{d:path("${path1(outlineAt((LOOP_SECONDS * i) / steps))}")}`);
  }
  frames.push(`${pct(LOOP_SECONDS)}%{d:path("${path1(outlineAt(0))}")}`);
  return frames.join("");
}

/** `@keyframes` for the eyes, flat at full lid between blinks. The engine's own
 *  first blink opens the loop, then a double follows three quarters round. */
function blinkKeyframes(): string {
  const { at, shut, closed } = blinkShape();
  const lid = shut - at;

  const points: Array<[number, number]> = [[0, 1]];
  for (const start of [at, DOUBLE_AT, DOUBLE_AT + lid]) {
    points.push([start, 1], [start + lid * 0.45, closed], [start + lid, 1]);
  }
  points.push([LOOP_SECONDS, 1]);

  // Strictly increasing, and one entry per instant, so the browser never has to
  // resolve two keyframes at the same offset.
  const out: string[] = [];
  let previous = -1;
  for (const [t, scale] of points) {
    if (t <= previous || t > LOOP_SECONDS) continue;
    previous = t;
    out.push(`${pct(t)}%{transform:scaleY(${r4(scale)})}`);
  }
  return out.join("");
}

/**
 * The eyes are cut in the mask rather than painted on top, so the mascot reads
 * the same on a light README as on a dark one. They blink about their own
 * middle: a fill-box origin is the one reference box with no ambiguity about
 * where it starts, and these are the only transforms left in the file.
 */
const STYLE = `<style>
.inkling-flicker{animation:inkling-flicker ${LOOP_SECONDS}s linear infinite}
.inkling-blink{transform-box:fill-box;transform-origin:50% 50%;animation:inkling-blink ${LOOP_SECONDS}s linear infinite}
@keyframes inkling-flicker{${flickerKeyframes()}}
@keyframes inkling-blink{${blinkKeyframes()}}
@media (prefers-reduced-motion:reduce){.inkling-flicker,.inkling-blink{animation:none}}
</style>`;

/** The still this loop starts and ends on, which is also what a reader who
 *  asked for reduced motion gets. */
export function readmeMascotFrame(): BotFrame {
  return new BotEngine(
    RAYON,
    "inkling-drift-loop",
    null,
    EXPRESSION_BY_ID.get("neutre") ?? null,
  ).sample(0);
}

/** Eyes stay holes cut in the mask, never pale shapes painted on top. */
function eyes(frame: BotFrame): string {
  return frame.eyes
    .map(
      (eye) =>
        `<g class="inkling-blink"><path d="${eye.d}" transform="${eye.matrix}" opacity="${r2(
          eye.alpha,
        )}" fill="#000"/></g>`,
    )
    .join("");
}

/** Standalone looping SVG: the frozen-frame recipe with the outline keyframes
 *  on the one place that owns it. The mask's copy of the outline is the same
 *  path carrying the same keyframes, so the ink and the hole it is cut with
 *  cannot drift apart. */
export function readmeMascotSvg(frame: BotFrame, ink: string, paper: string, still: string): string {
  const vb = DEMI_VIEWBOX;
  const cut =
    `<path class="inkling-flicker" d="${still}" fill="#fff"/>` +
    eyes(frame) +
    (frame.notch
      ? `<circle cx="${r2(frame.notch.x)}" cy="${r2(frame.notch.y)}" r="${r2(frame.notch.r)}" fill="#000"/>`
      : "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" width="320" height="320">` +
    STYLE +
    `<defs><mask id="inkling" maskUnits="userSpaceOnUse" x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}">` +
    `${cut}</mask></defs>` +
    `<g opacity="${r2(frame.bodyAlpha)}">` +
    `<path class="inkling-flicker" d="${still}" fill="${paper}"/>` +
    `<g mask="url(#inkling)"><rect x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}" fill="${ink}"/></g>` +
    `</g></svg>`
  );
}

/** The README asset: sampled from the live engine, then serialized. */
export function buildReadmeMascot(): string {
  const frame = readmeMascotFrame();
  return readmeMascotSvg(frame, "#1a1a1a", "#faf9f6", path1(outlineAt(0)));
}
