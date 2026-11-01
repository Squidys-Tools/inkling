// README mascot: a 24 s loop sampled from the sidebar's drift state, plus a still of frame 0.
// Run `bun tools/mascot/readme-loop.ts`. Safari ignores CSS `path()` in `d`, so outlines are SMIL.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BotEngine, type BotFrame } from "../../apps/renderer/src/mascot/bot/engine";
import {
  blendExpression,
  EXPRESSION_BY_ID,
  type BotExpression,
} from "../../apps/renderer/src/mascot/bot/expressions";
import { blinkScale, liveliness, REST_GAZE } from "../../apps/renderer/src/mascot/bot/face";
import { clamp, easings } from "../../apps/renderer/src/mascot/bot/math";
import { DEMI_VIEWBOX, RAYON } from "../../apps/renderer/src/mascot/bot/repere";

export const LOOP_SECONDS = 24;

const STATE = "inkling-drift-faced";
const MORPH = BotEngine.SHAPE_MORPH;
// Fixed, not app tokens: the README shows on light and dark pages alike.
const INK = "#1a1a1a";
const PAPER = "#faf9f6";

/** Eyes sit tighter than `neutre` asks: round placement walks them into a lobe as the body turns. */
const PLACEMENT = { yaw: 15, pitch: 24, roll: REST_GAZE.roll, split: 10.5 };

/** The beats the face changes on. Each sits clear of a blink; the last settles before the loop point. */
const PERFORMANCE: ReadonlyArray<readonly [number, string]> = [
  [0, "neutre"],
  [5.6, "curieux"],
  [9.0, "heureux"],
  [13.2, "neutre"],
  [16.0, "somnolent"],
  [19.4, "attentif"],
  [22.2, "neutre"],
];

const KEY_GAP = 1e-3;

function expression(id: string): BotExpression {
  const found = EXPRESSION_BY_ID.get(id);
  if (!found) throw new Error(`readme loop: no expression named ${id}`);
  return found;
}

const NEUTRE = expression("neutre");

/** The face at t: the beat in force, morphed off the previous one the way the engine morphs. */
function expressionAt(t: number): BotExpression {
  let i = 0;
  while (i + 1 < PERFORMANCE.length && t >= PERFORMANCE[i + 1]![0]) i++;
  const to = expression(PERFORMANCE[i]![1]);
  if (i === 0) return to;
  const from = expression(PERFORMANCE[i - 1]![1]);
  return blendExpression(from, to, easings.easeOutQuint(clamp((t - PERFORMANCE[i]![0]) / MORPH)));
}

/** Head aim in degrees: the beat's offset from neutre, placed by PLACEMENT, plus the sidebar's drift. */
function aimAt(t: number): { yaw: number; pitch: number } {
  const e = expressionAt(t);
  const drift = liveliness(t);
  return {
    yaw: PLACEMENT.yaw + (e.gaze.yaw - NEUTRE.gaze.yaw) + drift.dYaw,
    pitch: PLACEMENT.pitch + (e.gaze.pitch - NEUTRE.gaze.pitch) + drift.dPitch,
  };
}

/**
 * The engine at t. Every beat up to t is replayed into one instance, so a held
 * beat morphs as it does in the app; a fresh instance would snap to the beat.
 */
function frameAt(t: number): BotFrame {
  const engine = new BotEngine(RAYON, STATE, null, null);
  for (const [at, id] of PERFORMANCE) {
    if (at > t) break;
    engine.setExpression({ ...expression(id), split: PLACEMENT.split }, at);
  }
  const aim = aimAt(t);
  engine.setLook({ yaw: aim.yaw, pitch: aim.pitch, mix: 1, wander: 0 }, -10);
  const frame = engine.sample(t);
  if (frame.dots.length > 0 || frame.arcs.length > 0 || frame.notif) {
    throw new Error("readme loop: the drift state now draws dots, arcs or a notification");
  }
  return frame;
}

/** The bottom of a V-shaped lid curve, by ternary search so the grid cannot round it off. */
function trough(lid: (t: number) => number, from: number, to: number): number {
  let lo = from;
  let hi = to;
  for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (lid(a) < lid(b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}

/**
 * The start, the exact bottom and the end of every blink. The lid is a straight
 * line into and out of the trough, so a browser interpolating between these
 * three instants reproduces the blink exactly.
 */
function blinkInstants(): number[] {
  const lid = (t: number) => blinkScale(liveliness(t, { wander: 0 }).lid);
  const out: number[] = [];
  const step = 0.001;
  for (let t = 0; t < LOOP_SECONDS; t += step) {
    if (lid(t) === 1) continue;
    let end = t;
    while (end < LOOP_SECONDS && lid(end) < 1) end += step;
    out.push(t, trough(lid, t, end), end);
    t = end;
  }
  return out;
}

/** Sorted key times that start at 0 and end at the loop point, with no two within KEY_GAP. */
function trackTimes(times: number[]): number[] {
  const inner = [...new Set(times)]
    .filter((t) => t > KEY_GAP && t < LOOP_SECONDS - KEY_GAP)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1]! > KEY_GAP);
  return [0, ...inner, LOOP_SECONDS];
}

const WHOLE_SECONDS = Array.from({ length: LOOP_SECONDS }, (_, i) => i);
const BODY_TIMES = trackTimes(WHOLE_SECONDS);
const EYE_TIMES = trackTimes([
  ...WHOLE_SECONDS,
  ...PERFORMANCE.flatMap(([at]) => [0, 0.4, 1].map((k) => at + k * MORPH)),
  ...blinkInstants(),
]);

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);
const frac = (t: number) => String(Math.round((t / LOOP_SECONDS) * 1e6) / 1e6);

/** Rounds coordinates to half a unit, a quarter pixel at the 160px the README shows the mascot at. */
const path1 = (d: string) =>
  d.replace(/-?\d+\.?\d*/g, (m) => String(Math.round(Number(m) * 2) / 2));

/** A SMIL `d` track over `times`. The last key holds the value at t=0, so the loop closes. */
function animateD(times: number[], value: (t: number) => string): string {
  const values = times.map((t, i) => value(i === times.length - 1 ? 0 : t));
  const keyTimes = times.map(frac).join(";");
  return `<animate attributeName="d" dur="${LOOP_SECONDS}s" repeatCount="indefinite" keyTimes="${keyTimes}" values="${values.join(";")}"/>`;
}

/** The eye's CSS transform track: its tangent frame, gaze and blink, as the engine folds them. */
function lookKeyframes(eye: number): string {
  return EYE_TIMES.map((t, i) => {
    const at = i === EYE_TIMES.length - 1 ? 0 : t;
    return `${r4((100 * t) / LOOP_SECONDS)}%{transform:${frameAt(at).eyes[eye]!.matrix}}`;
  }).join("");
}

function assertStaticAlpha(first: BotFrame) {
  for (const t of EYE_TIMES) {
    const frame = frameAt(t);
    const eyesMatch = frame.eyes.every((eye, i) => eye.alpha === first.eyes[i]!.alpha);
    if (!eyesMatch || frame.bodyAlpha !== first.bodyAlpha) {
      throw new Error(`readme loop: opacity changes at ${t}s, but the file writes it once`);
    }
  }
}

function buildSvg(animated: boolean): string {
  const first = frameAt(0);
  if (animated) assertStaticAlpha(first);
  const vb = DEMI_VIEWBOX;
  const style = animated
    ? `<style>${[0, 1]
        .map(
          (eye) =>
            `.inkling-eye-${eye}{animation:inkling-look-${eye} ${LOOP_SECONDS}s linear infinite}` +
            `@keyframes inkling-look-${eye}{${lookKeyframes(eye)}}`,
        )
        .join("")}</style>`
    : "";
  // One body path, drawn twice: the mask cuts the eyes from it and the paper fill sits behind them.
  const body =
    `<path id="inkling-body" d="${path1(first.bodyPath)}">` +
    (animated ? animateD(BODY_TIMES, (t) => path1(frameAt(t).bodyPath)) : "") +
    `</path>`;
  const eyes = first.eyes
    .map(
      (eye, i) =>
        `<path${animated ? ` class="inkling-eye-${i}"` : ""} d="${eye.d}" transform="${eye.matrix}" opacity="${r2(eye.alpha)}" fill="#000">` +
        (animated ? animateD(EYE_TIMES, (t) => frameAt(t).eyes[i]!.d) : "") +
        `</path>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" width="320" height="320">` +
    style +
    `<defs>${body}<mask id="inkling" maskUnits="userSpaceOnUse" x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}">` +
    `<use href="#inkling-body" fill="#fff"/>${eyes}</mask></defs>` +
    `<g opacity="${r2(first.bodyAlpha)}">` +
    `<use href="#inkling-body" fill="${PAPER}"/>` +
    `<g mask="url(#inkling)"><rect x="${-vb}" y="${-vb}" width="${vb * 2}" height="${vb * 2}" fill="${INK}"/></g>` +
    `</g></svg>`
  );
}

/** The looping README mascot. */
export function readmeLoopSvg(): string {
  return buildSvg(true);
}

/** Frame 0 of the loop, for readers who ask for reduced motion. */
export function readmeStillSvg(): string {
  return buildSvg(false);
}

if (import.meta.main) {
  const dir = resolve(import.meta.dir, "../../docs/assets/mascots");
  writeFileSync(resolve(dir, "inkling-splash-loop.svg"), `${readmeLoopSvg()}\n`);
  writeFileSync(resolve(dir, "inkling-splash-still.svg"), `${readmeStillSvg()}\n`);
}
