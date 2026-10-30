import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, type BotExpression } from "./bot/expressions";
import { REST_GAZE, blinkScale, liveliness } from "./bot/face";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";

/**
 * The mascot as a looping SVG for the README, sampled from the engine at build time
 * into CSS keyframes. The turn is baked into `d` keyframes, not `rotate()`: engines
 * disagree on the view-box transform origin, so a pivot can land far off the page.
 */

/** One full turn, matching `inkling-drift`'s 24 s rotation period. */
const LOOP_SECONDS = 24;

/** Outlines interpolate along the chord, not the arc; coarser than 1 s visibly shrinks the body. */
const FLICKER_STEP_SECONDS = 1;

/** The sidebar's own drift, with `baseFace` on so the score below can wear it. */
const STATE = "inkling-drift-faced";
const MORPH = BotEngine.SHAPE_MORPH;

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

const pct = (t: number) => r4((100 * t) / LOOP_SECONDS);

/** Half a unit. The outline is 316 units across and the README shows it at
 *  160px, so this is a fiftieth of a pixel there. */
const path1 = (d: string) =>
  d.replace(/-?\d+\.?\d*/g, (m) => String(Math.round(Number(m) * 2) / 2));

/**
 * A tightened face placement pinned for the whole loop: at the app's own placement
 * a lobe of the turning body sweeps over an eye. Expressions contribute shape, never
 * direction. `readmeMascot.test.ts` guards the clearance; raising the pitch eats it.
 */
const PLACEMENT = { yaw: 15, pitch: 24, roll: REST_GAZE.roll, split: 10.5 };

const NEUTRE = EXPRESSION_BY_ID.get("neutre") as BotExpression;

/** Expressions come from the script, so a typo in an id is a bug worth seeing
 *  rather than a silent no-op. It throws at build time, not in the browser. */
function expression(id: string): BotExpression {
  const found = EXPRESSION_BY_ID.get(id);
  if (!found) throw new Error(`readme mascot: no expression named ${id}`);
  return found;
}

/**
 * The beats the face changes on. Every beat sits clear of a blink, since a blink
 * landing in a morph hides it half-done; `readmeMascot.test.ts` enforces that.
 */
const PERFORMANCE: ReadonlyArray<readonly [number, string]> = [
  [0, "neutre"],
  [5.6, "curieux"],
  [9.0, "heureux"],
  [13.2, "neutre"],
  [16.0, "somnolent"],
  [19.4, "attentif"],
  [22.2, "neutre"],
];

/** The expression in force at `t`, morphed off the previous beat the way the
 *  engine's own `setExpression` does it. */
function scored(t: number): BotExpression {
  let i = 0;
  while (i + 1 < PERFORMANCE.length && t >= PERFORMANCE[i + 1]![0]) i++;
  const to = expression(PERFORMANCE[i]![1]);
  if (i === 0) return to;
  const from = expression(PERFORMANCE[i - 1]![1]);
  const k = (t - PERFORMANCE[i]![0]) / MORPH;
  return blendTo(from, to, k >= 1 ? 1 : 1 - (1 - k) ** 5);
}

/** The engine's eye blend, without reaching into its private `lerpEyeCfg`. */
function blendTo(from: BotExpression, to: BotExpression, t: number): BotExpression {
  const mix = (a: number, b: number) => a + (b - a) * t;
  const eye = (a: BotExpression["eyes"][number], b: BotExpression["eyes"][number]) => ({
    w: mix(a.w, b.w),
    h: mix(a.h, b.h),
    open: mix(a.open, b.open),
    tilt: mix(a.tilt ?? 0, b.tilt ?? 0),
  });
  return {
    id: to.id,
    gaze: {
      yaw: mix(from.gaze.yaw, to.gaze.yaw),
      pitch: mix(from.gaze.pitch, to.gaze.pitch),
      roll: mix(from.gaze.roll, to.gaze.roll),
    },
    split: mix(from.split, to.split),
    eyes: [eye(from.eyes[0], to.eyes[0]), eye(from.eyes[1], to.eyes[1])],
  };
}

/**
 * The scored expression, pinned at `PLACEMENT`, wandered by the engine's own
 * `liveliness` so the README's gaze matches the sidebar's.
 */
function face(t: number): BotExpression {
  const e = scored(t);
  const life = liveliness(t);
  return {
    ...e,
    gaze: {
      yaw: PLACEMENT.yaw + (e.gaze.yaw - NEUTRE.gaze.yaw) + life.dYaw,
      pitch: PLACEMENT.pitch + (e.gaze.pitch - NEUTRE.gaze.pitch) + life.dPitch,
      roll: PLACEMENT.roll + (e.gaze.roll - NEUTRE.gaze.roll),
    },
    split: PLACEMENT.split,
  };
}

/**
 * Replays every beat up to `t` into one engine: a fresh engine per sample has no
 * `exprPrev` and would snap between faces instead of morphing.
 */
function frameAt(t: number): BotFrame {
  const engine = new BotEngine(RAYON, STATE, null, null);
  for (const [at, id] of PERFORMANCE) {
    if (at > t) break;
    const e = expression(id);
    engine.setExpression({ ...e, split: PLACEMENT.split }, at);
  }
  const g = face(t).gaze;
  engine.setLook({ yaw: g.yaw, pitch: g.pitch, mix: 1, spin: 0, wander: 0 }, -10);
  return engine.sample(t);
}

/** The loop's outline at t, turned and reshaped, straight from the engine. */
function outlineAt(t: number): string {
  return frameAt(t).bodyPath;
}

/**
 * Each blink's start, trough, and reopen. The engine's lid curve is a triangle, so
 * linear interpolation between these three reproduces it exactly.
 */
interface Blink {
  /** when the lid starts falling, in seconds */
  startsAt: number;
  /** when it is lowest */
  shutAt: number;
  /** when it is back up */
  openAt: number;
  /** the lid scale at the trough: 1 open, `blinkScale(0)` shut */
  shutScale: number;
}

function blinks(): Blink[] {
  const lid = (t: number) => blinkScale(liveliness(t, { wander: 0 }).lid);
  const step = 0.001;
  const out: Blink[] = [];

  /**
   * The lid curve's trough is a corner, which sampling cuts above the vertex so the
   * eye never quite shuts. Ternary search finds the exact minimum.
   */
  const trough = (from: number, to: number) => {
    let lo = from;
    let hi = to;
    for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
      const a = lo + (hi - lo) / 3;
      const b = hi - (hi - lo) / 3;
      if (lid(a) < lid(b)) hi = b;
      else lo = a;
    }
    const shutAt = (lo + hi) / 2;
    return { shutAt, shutScale: lid(shutAt) };
  };

  for (let t = 0; t < LOOP_SECONDS; t += step) {
    if (lid(t) === 1) continue;
    let end = t;
    while (end < LOOP_SECONDS && lid(end) < 1) end += step;
    out.push({ startsAt: t, ...trough(t, end), openAt: end });
    t = end;
  }
  return out;
}

/** `@keyframes` for the body. The loop point repeats the first outline, not
 *  `sample(24)`, which has already crossed into the next state's pose. */
function flickerKeyframes(): string {
  const steps = Math.round(LOOP_SECONDS / FLICKER_STEP_SECONDS);
  const frames: string[] = [];
  for (let i = 0; i < steps; i++) {
    frames.push(
      `${pct((LOOP_SECONDS * i) / steps)}%{d:path("${path1(outlineAt((LOOP_SECONDS * i) / steps))}")}`,
    );
  }
  frames.push(`${pct(LOOP_SECONDS)}%{d:path("${path1(outlineAt(0))}")}`);
  return frames.join("");
}

/** Instants the eye transform must hit: the body's 1 s grid, both ends of every
 *  morph, and all three instants of every blink. A 1 s grid alone smears those. */
function eyeTimes(): number[] {
  const steps = Math.round(LOOP_SECONDS / FLICKER_STEP_SECONDS);
  const times = new Set<number>();
  for (let i = 0; i < steps; i++) times.add((LOOP_SECONDS * i) / steps);
  for (const [at] of PERFORMANCE) {
    for (const k of [0, 0.4, 1]) times.add(at + k * MORPH);
  }
  for (const b of blinks()) {
    for (const t of [b.startsAt, b.shutAt, b.openAt]) times.add(t);
  }
  return dedupe(times, 1e-6);
}

/**
 * Instants the eye shape must hit: the start of each morph, or the browser ramps
 * across the whole previous hold, plus points at 40% and 100% so the ease-out
 * doesn't read as a linear ramp.
 */
function shapeTimes(): number[] {
  const times = new Set<number>();
  for (const [at] of PERFORMANCE) {
    for (const k of [0, 0.4, 1]) times.add(at + k * MORPH);
  }
  return dedupe(times, 1e-6);
}

/** Sorted, de-duplicated, and wrapped so the track starts at 0 and ends at the
 *  loop point with the value the first frame holds. */
function dedupe(times: Iterable<number>, gap: number): number[] {
  const sorted = [...times]
    .filter((t) => t > -gap && t < LOOP_SECONDS + gap)
    .sort((a, b) => a - b)
    .filter((t, i, all) => i === 0 || t - all[i - 1]! > gap);
  return [0, ...sorted.filter((t) => t > gap), LOOP_SECONDS];
}

const EYE_TIMES = eyeTimes();
const SHAPE_TIMES = shapeTimes();

/** A track over `times`, whose final entry repeats the one at t=0: `liveliness`
 *  periods don't divide 24, so a real sample at t=24 differs from t=0 and twitches
 *  the seam. */
function over(times: number[], at: (t: number) => string): string {
  const frames = times.map((t) => `${pct(t)}%{${at(t)}}`);
  frames[frames.length - 1] = `${pct(LOOP_SECONDS)}%{${at(0)}}`;
  return frames.join("");
}

/** `transform` for one eye: the tangent frame, the gaze and the lid the engine
 *  folds into one matrix. Sampled where the eye actually is, not where the body
 *  is, which is what makes the mascot look like it is looking at something. */
function lookKeyframes(eye: number, times: number[]): string {
  return over(times, (t) => `transform:${frameAt(t).eyes[eye]?.matrix ?? "matrix(0,0,0,0,0,0)"}`);
}

/** The eye's own shape. This is where an expression lives: `heureux` is a squint
 *  with the tops converging, `curieux` is two different eyes, and none of that
 *  is in the matrix. */
function shapeKeyframes(eye: number): string {
  return over(SHAPE_TIMES, (t) => `d:path("${frameAt(t).eyes[eye]?.d ?? "M0 0Z"}")`);
}

/** The lid, flat at full between blinks. The engine's own calendar decides
 *  where they fall; all this does is draw them. */
function blinkKeyframes(): string {
  const points: Array<[number, number]> = [[0, 1]];
  for (const b of blinks()) {
    points.push([b.startsAt, 1], [b.shutAt, b.shutScale], [b.openAt, 1]);
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
 * Eyes are cut in the mask so they read on light and dark READMEs. Each eye's shape
 * and look share one `animation` shorthand: separate rules reset each other's
 * longhands and freeze the eye.
 */
function style(): string {
  const track = (name: string) => `${name} ${LOOP_SECONDS}s linear infinite`;
  return `<style>
.inkling-flicker{animation:${track("inkling-flicker")}}
.inkling-blink{transform-box:fill-box;transform-origin:50% 50%;animation:${track("inkling-blink")}}
.inkling-eye-0{animation:${track("inkling-look-0")},${track("inkling-shape-0")}}
.inkling-eye-1{animation:${track("inkling-look-1")},${track("inkling-shape-1")}}
@keyframes inkling-flicker{${flickerKeyframes()}}
@keyframes inkling-look-0{${lookKeyframes(0, EYE_TIMES)}}
@keyframes inkling-look-1{${lookKeyframes(1, EYE_TIMES)}}
@keyframes inkling-shape-0{${shapeKeyframes(0)}}
@keyframes inkling-shape-1{${shapeKeyframes(1)}}
@keyframes inkling-blink{${blinkKeyframes()}}
@media (prefers-reduced-motion:reduce){.inkling-flicker,.inkling-blink,.inkling-eye-0,.inkling-eye-1{animation:none}}
</style>`;
}

/** The still this loop starts and ends on, which is also what a reader who
 *  asked for reduced motion gets. */
export function readmeMascotFrame(): BotFrame {
  return frameAt(0);
}

/** Eyes stay holes cut in the mask, never pale shapes painted on top. */
function eyes(frame: BotFrame): string {
  return frame.eyes
    .map(
      (eye, i) =>
        `<g class="inkling-blink"><path class="inkling-eye-${i}" d="${eye.d}" transform="${eye.matrix}" opacity="${r2(
          eye.alpha,
        )}" fill="#000"/></g>`,
    )
    .join("");
}

/** Standalone looping SVG: the frozen-frame recipe with the outline keyframes
 *  on the one place that owns it. The mask's copy of the outline is the same
 *  path carrying the same keyframes, so the ink and the hole it is cut with
 *  cannot drift apart. */
export function readmeMascotSvg(
  frame: BotFrame,
  ink: string,
  paper: string,
  still: string,
): string {
  const vb = DEMI_VIEWBOX;
  const cut =
    `<path class="inkling-flicker" d="${still}" fill="#fff"/>` +
    eyes(frame) +
    (frame.notch
      ? `<circle cx="${r2(frame.notch.x)}" cy="${r2(frame.notch.y)}" r="${r2(frame.notch.r)}" fill="#000"/>`
      : "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-vb} ${-vb} ${vb * 2} ${vb * 2}" width="320" height="320">` +
    style() +
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
