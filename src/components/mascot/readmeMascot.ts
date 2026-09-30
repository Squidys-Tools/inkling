import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { blinkScale, liveliness } from "./bot/face";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import { closedPath, toPoints } from "./bot/shape";
import { STATE_BY_ID } from "./bot/states";

/**
 * The mascot as a looping standalone SVG, for the README.
 *
 * GitHub renders an SVG referenced from an `<img>` as a document with CSS and
 * no script, so keyframes inside it run and nothing else has to change.
 *
 * The motion is the sidebar's own `inkling-drift-loop`, and it is split across
 * two animations because the two halves of it are cheap in different ways. The
 * turn is rigid, so it rides on a `rotate()` and costs the compositor nothing.
 * The lobe drift reshapes the outline, which no transform can express, so those
 * radii are baked into `d` keyframes straight from the engine's profile.
 *
 * Splitting it that way is also what keeps the file honest. Baked frame to
 * frame, a full turn is 64 cubics interpolated along a chord, so the outline
 * would shrink by ~0.9% halfway through every step and the blob would pulse.
 * Rotating the un-turned path instead means the turn is exact and the baked
 * frames only carry the slow lobe change, which samples cleanly.
 */

/** One full turn, matching `inkling-drift-loop`'s 24 s rotation period. */
const LOOP_SECONDS = 24;

/** Baked outlines around the loop, the loop point included. Every lobe term
 *  has a visual period between 3.4s and 6s, so one outline every 1.5s is two to
 *  four samples per cycle: enough that the browser's linear interpolation
 *  between them tracks the curve, and the only term close to the limit is the
 *  7-fold one at a 0.6% amplitude, well under a pixel at the size the README
 *  shows this. */
const FLICKER_STEP_SECONDS = 1.5;

/** Where the engine blinks again three quarters of the way round, and how long
 *  one lid takes, so the second of the pair follows the first. */
const DOUBLE_AT = (LOOP_SECONDS * 3) / 4;

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

const pct = (t: number) => r4((100 * t) / LOOP_SECONDS);

/** Half a unit. The outline is 316 units across and the README shows it at
 *  160px, so this is a fiftieth of a pixel there, and it takes a fifth off the
 *  one thing in this file that costs anything. */
const path1 = (d: string) => d.replace(/-?\d+\.?\d*/g, (m) => String(Math.round(Number(m) * 2) / 2));

/**
 * The loop's outline at t, with the rotation left out.
 *
 * This is `toPoints` and `closedPath` — the engine's own path construction —
 * called on the state's profile at `rot: 0`. `inkling-drift-loop` has no squash
 * and no offset, so the engine's path is exactly its profile turned, which the
 * stylesheet applies as a transform instead.
 */
function outlineAt(t: number): string {
  const sil = STATE_BY_ID.get("inkling-drift-loop")!.pose(t).sil;
  const unturned = { ...sil, rot: 0 };
  return closedPath(toPoints(unturned, RAYON));
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

/** `@keyframes` for the turn. A whole number of turns is its own identity, so
 *  the loop has no seam here. */
function turnKeyframes(): string {
  return `0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}`;
}

/** Baked outlines around the loop. The last one lands on the loop point at
 *  exactly 100%, holding the same outline the first holds at 0%, so the
 *  browser interpolates nothing across the seam and the repeat is provably
 *  continuous rather than merely close. */
function flickerKeyframes(): string {
  const frames: string[] = [];
  const steps = Math.round(LOOP_SECONDS / FLICKER_STEP_SECONDS);
  for (let i = 0; i <= steps; i++) {
    const t = (LOOP_SECONDS * i) / steps;
    frames.push(`${pct(t)}%{d:path("${path1(outlineAt(t))}")}`);
  }
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
 * The sway is carried by the body group, and the mask resolves in the user space
 * of whatever references it, so the mask's own copy of the outline must not turn
 * a second time or the ink and its backing drift apart. The eyes are cut inside
 * the mask and blink there, about their own middle: a fill-box origin stays put
 * under the turned ancestor, where a view-box one would not.
 */
const STYLE = `<style>
.inkling-turn{transform-box:view-box;transform-origin:50% 50%;animation:inkling-turn ${LOOP_SECONDS}s linear infinite}
.inkling-flicker{animation:inkling-flicker ${LOOP_SECONDS}s linear infinite}
.inkling-blink{transform-box:fill-box;transform-origin:50% 50%;animation:inkling-blink ${LOOP_SECONDS}s linear infinite}
@keyframes inkling-turn{${turnKeyframes()}}
@keyframes inkling-flicker{${flickerKeyframes()}}
@keyframes inkling-blink{${blinkKeyframes()}}
@media (prefers-reduced-motion:reduce){.inkling-turn,.inkling-flicker,.inkling-blink{animation:none}}
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

/** Eyes stay holes cut in the mask, never pale shapes painted on top, so the
 *  mascot reads the same on a light README as on a dark one. */
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

/** Standalone looping SVG: the frozen-frame recipe, with the outline keyframes
 *  on the one place that owns it and the turn on the group around both the
 *  paper and the ink. */
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
    `<g class="inkling-turn" opacity="${r2(frame.bodyAlpha)}">` +
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
