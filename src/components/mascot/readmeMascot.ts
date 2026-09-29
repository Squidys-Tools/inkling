import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID } from "./bot/expressions";
import { blinkScale, liveliness } from "./bot/face";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import { COLOR_BY_ID, SHAPE_BY_ID } from "./bot/skins";
import { STATE_BY_ID } from "./bot/states";

/**
 * The mascot as a looping standalone SVG, for the README.
 *
 * The hero there is a still today, which reads as a dead asset rather than a
 * character. GitHub renders an SVG referenced from an `<img>` as a document
 * with CSS and no script, so keyframes inside it run, and the whole animation
 * is three transforms, which is all a browser has to composite.
 *
 * Every number comes out of the engine instead of out of a stylesheet: the
 * geometry is a real sampled frame, the sway is the `inkling-sway` pose the
 * sidebar already plays, and the blink is the engine's own lid curve through
 * its own `blinkScale` floor. A loop has to close on itself and a raw engine
 * slice cannot, its noise periods being coprime, so the shape is borrowed and
 * only its place in the loop is chosen here.
 */

/** Loop length in seconds. The two sway terms run on 6 s and 3 s, so 6 s closes. */
const LOOP_SECONDS = 6;

/** Keyframes around the body loop. Half a second is well under what a sine
 *  needs to read as one, and it leaves the rest of the loop flat. */
const SWAY_SAMPLES = 13;

/** Where the engine blinks again three quarters of the way round, and how
 *  long one lid takes, so the second one of the pair follows the first. */
const DOUBLE_AT = (LOOP_SECONDS * 3) / 4;

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

const pct = (t: number) => r4((100 * t) / LOOP_SECONDS);

/**
 * Body motion for the README loop, read off the `inkling-sway` pose the
 * sidebar already plays rather than restated as a sine here. Scale then
 * rotate is the order `toPoints` applies them in, so a body drawn at t=0
 * matches the engine frame it came from at every t.
 */
function bodyTransform(t: number): string {
  const sil = STATE_BY_ID.get("inkling-sway")!.pose(t).sil;
  return `scale(1,${r4(sil.sy)}) rotate(${r4((sil.rot * 180) / Math.PI)}deg)`;
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

/** `@keyframes` for the body. First and last land on the same pose, which is
 *  what lets the loop repeat without a seam. */
function bodyKeyframes(): string {
  const frames: string[] = [];
  for (let i = 0; i < SWAY_SAMPLES; i++) {
    const t = (LOOP_SECONDS * i) / (SWAY_SAMPLES - 1);
    frames.push(`${pct(t)}%{transform:${bodyTransform(t)}}`);
  }
  return frames.join("");
}

/** `@keyframes` for the eyes, flat at full lid between blinks. The engine's
 *  own first blink opens the loop, then a double follows three quarters round. */
function blinkKeyframes(): string {
  const { at, shut, closed } = blinkShape();
  const lid = shut - at;

  const points: Array<[number, number]> = [[0, 1]];
  for (const start of [at, DOUBLE_AT, DOUBLE_AT + lid]) {
    points.push([start, 1], [start + lid * 0.45, closed], [start + lid, 1]);
  }
  points.push([LOOP_SECONDS, 1]);

  // Strictly increasing, and one entry per instant, so the browser never has
  // to resolve two keyframes at the same offset.
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
 * of whatever references it, so the mask's own copy of the body must not sway a
 * second time or the ink and its backing drift apart. The eyes are cut inside
 * the mask and blink there, about their own middle: a fill-box origin stays put
 * under the rotated ancestor, where a view-box one would not.
 */
const STYLE = `<style>
.inkling-sway{transform-box:view-box;transform-origin:50% 50%;animation:inkling-sway ${LOOP_SECONDS}s linear infinite}
.inkling-blink{transform-box:fill-box;transform-origin:50% 50%;animation:inkling-blink ${LOOP_SECONDS}s linear infinite}
@keyframes inkling-sway{${bodyKeyframes()}}
@keyframes inkling-blink{${blinkKeyframes()}}
@media (prefers-reduced-motion:reduce){.inkling-sway,.inkling-blink{animation:none}}
</style>`;

/** The still this loop starts and ends on, which is also what a reader who
 *  asked for reduced motion gets. */
export function readmeMascotFrame(): BotFrame {
  return new BotEngine(
    RAYON,
    "inkling-sway",
    SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
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

/** Standalone looping SVG: the frozen-frame recipe plus the keyframes, with
 *  the sway applied once, on the group that owns both the paper and the ink. */
export function readmeMascotSvg(frame: BotFrame, ink: string, paper: string): string {
  const vb = DEMI_VIEWBOX;
  const cut =
    `<path d="${frame.bodyPath}" fill="#fff"/>` +
    eyes(frame) +
    (frame.notch
      ? `<circle cx="${r2(frame.notch.x)}" cy="${r2(frame.notch.y)}" r="${r2(frame.notch.r)}" fill="#000"/>`
      : "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" width="320" height="320">` +
    STYLE +
    `<defs><mask id="inkling" maskUnits="userSpaceOnUse" x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}">` +
    `${cut}</mask></defs>` +
    `<g class="inkling-sway" opacity="${r2(frame.bodyAlpha)}">` +
    `<path d="${frame.bodyPath}" fill="${paper}"/>` +
    `<g mask="url(#inkling)"><rect x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}" fill="${ink}"/></g>` +
    `</g></svg>`
  );
}

/** The README asset: sampled from the live engine, then serialized. */
export function buildReadmeMascot(): string {
  return readmeMascotSvg(
    readmeMascotFrame(),
    COLOR_BY_ID.get("inkling")?.hex ?? "#1a1a1a",
    "#faf9f6",
  );
}
