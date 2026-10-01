import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, type BotExpression } from "./bot/expressions";
import { REST_GAZE, blinkScale, liveliness } from "./bot/face";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";

/**
 * The mascot as a looping standalone SVG, for the README.
 *
 * GitHub renders an SVG referenced from an `<img>` as a document with CSS and
 * no script, so keyframes inside it run and nothing else has to change.
 *
 * There is no clock here. The whole 24 seconds is sampled out of the engine once,
 * at build time, and written down as CSS: the body outline as `d` keyframes, the
 * eyes as their own shape and transform tracks, the blinks as a lid track. What
 * the browser plays is a recording, not the engine.
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
 * 15 degree step, and measured against the continuous body the whole track
 * strays by 1.74% of the radius at worst, 0.56% on average — 0.88px and 0.28px
 * at the 160px the README draws it at. Denser keyframes buy that back and cost
 * bytes nobody can see, so one per second stands.
 *
 * The loop closes HERE, in the last keyframe, and not in the state. Every track
 * pastes its value at t=0 at 100%, so the browser interpolates its final
 * keyframe to the opening one across the last second. That is a straight line
 * covering that second's 15 degree turn — which is what a normal second of this
 * body is anyway, the outline travelling 13px at the README's size. So the
 * motion does not have to close on itself, and `inkling-drift-faced` does not
 * try: it is the sidebar's `inkling-drift`, periods and all. An earlier version
 * snapped every one of those periods to a divisor of 24 to make the state
 * self-closing, and paid for it with a silhouette that recurred every 12s while
 * the body took twice as long to come round — which read, correctly, as a
 * different mascot. Closing the loop here instead costs 2.3px of lobe drift
 * folded into a seam that was already a full second long.
 */

/** One full turn, matching `inkling-drift`'s 24 s rotation period. */
const LOOP_SECONDS = 24;

/** One baked outline per second. See the chord note above for why not coarser. */
const FLICKER_STEP_SECONDS = 1;

/** The sidebar's own drift, with `baseFace` on so the score below can wear it. */
const STATE = "inkling-drift-faced";
const MORPH = BotEngine.SHAPE_MORPH;

const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

const pct = (t: number) => r4((100 * t) / LOOP_SECONDS);

/** Half a unit. The outline is 316 units across and the README shows it at
 *  160px, so this is a fiftieth of a pixel there. */
const path1 = (d: string) => d.replace(/-?\d+\.?\d*/g, (m) => String(Math.round(Number(m) * 2) / 2));

/**
 * Where the face sits on the body, and the one thing the script never varies.
 *
 * `neutre` asks for the round placement the blob wears in the app: gaze 28.5
 * degrees, split 15.5. On a body that rotates under a steady face that is too
 * far out, and the eyes get eaten by a lobe twice per turn. The state carries a
 * tightened placement for exactly this reason and the script pins the same one
 * here, so an expression contributes its SHAPE — the squint, the tilt, the size
 * — and never its direction.
 *
 * 10.5 is the split, 15 and 24 the yaw and pitch. Measured over the whole loop
 * with the full expression score running, the tightest an eye corner ever comes
 * to the outline is 9.0 units, or 4.6px at the size the README draws this, and it
 * is the FAR eye a quarter of the way round the turn that gets there — the near
 * one never drops below 25. That figure is what decides where the face may sit:
 * run the same score at the app's own placement and an eye ends up about 4 units
 * OUTSIDE the blob. Individual expressions are not the discriminator — held all
 * loop, `surpris` and `excite` both fit at this placement with under 3 units to
 * spare, and `neutre` is the one that walks out at the app's. It is the score as
 * it actually plays, on a body turning under it, that needs the tightened one.
 *
 * The pitch is the one that costs the most. The state this replaces sat at
 * `REST_GAZE`'s 28.6, which put the eyes higher and was fine while the face
 * never changed; every degree up from here is a degree of clearance given up,
 * and 28 leaves under 3px, which is close enough to the edge to read as a nick
 * rather than as a margin.
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
 * The 24 seconds, as the beats it changes face on.
 *
 * Not a mood ring and not a demo reel. The mascot rests, notices something,
 * brightens, settles, dozes, looks up, and is back where it started before the
 * loop comes round — the shape of a small thing that is comfortable and
 * happens to be awake. Held expressions are the point; the beats exist so the
 * rest has something to be a rest FROM.
 *
 * Every beat sits clear of a blink, and that is not a coincidence: a blink
 * closes the eye to a line, so one landing inside a morph hides the change
 * half-done. `readmeMascot.test.ts` fails the build if that ever stops holding.
 *
 * The last beat settles 1.35 s before the loop point, which puts the seam
 * inside a held `neutre` where the face and the outline are both stationary.
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
 * The face at `t`: the scored expression, pinned where `PLACEMENT` says, then
 * wandered by the engine's own `liveliness`.
 *
 * Reading the drift straight off `liveliness` rather than off a second hand-rolled
 * copy is what keeps the README's gaze the sidebar's. It used to be copied here
 * with every period snapped to a divisor of 24, on the grounds that the loop
 * needed it — but the loop never needed it: the transform track pastes its value
 * at t=0 at 100%, so the seam is already a straight line across the last second,
 * gaze drift or not. The roll is left out, as the engine's own `Look` note
 * explains, and the wander reaches the engine through `setLook` with `mix: 1`,
 * because that is the only undated input `sample` has.
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
 * The engine at `t`: every beat up to now replayed into one instance, the gaze
 * steered, then sampled.
 *
 * Replaying rather than sampling fresh is what makes a held expression morph.
 * A new engine per sample would find `exprPrev` null and snap to whatever it
 * was handed, and a face that changes by cutting is a slideshow.
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
 * Every blink in the loop, as the three instants that matter: when it starts,
 * when the lid is at its lowest, and when it is back up.
 * The lid curve is a triangle in the engine, so a browser interpolating
 * linearly between those three reproduces it exactly, where a sample grid
 * spread over the same event rounds the trough off and leaves the eye never
 * quite shut.
 *
 * The two times and the one scale are named apart on purpose. A single field
 * for both used to be called `closed`, and the keyframe builder then wrote that
 * SCALE into the slot that wants a TIME: the reopen landed at 0.06 s, sorted
 * out of order, and was dropped. Every blink then left the eye shut until the
 * next one 3.7 s later, which reads as a slow, drowsy blink — the exact
 * complaint this file was changed to answer.
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
   * The exact bottom of the trough.
   *
   * The lid falls in a straight line and rises in a straight line, so the bottom
   * is a CORNER. Interpolating a straight line across a corner cuts the chord,
   * which on a V is above the vertex: the sampled trough lands about 0.002
   * high and the eye never quite shuts. It read as exact before only because
   * the engine's first blink happened to put its corner on the sampling grid.
   *
   * Ternary search on a bracket, not an interpolation: the trough is the unique
   * minimum of the window, and a search converges on it whatever the grid does.
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

/** `@keyframes` for the body: the loop point included, holding the same
 *  outline the first frame holds, so the repeat is continuous.
 *
 *  The loop point is the *first* outline pasted back in, not a sample at t=24.
 *  The state has length 24s, so `sample(24)` has already crossed into the next
 *  state and is a different pose; a keyframe taken there would put a visible jump
 *  at exactly the moment the animation is supposed to be invisible. Nothing here
 *  needs the state to agree with itself at 24 — the browser draws a straight
 *  line from the t=23 outline to the t=0 one, which is that second's turn either
 *  way. See the note at the top of the file on why the loop closes here. */
function flickerKeyframes(): string {
  const steps = Math.round(LOOP_SECONDS / FLICKER_STEP_SECONDS);
  const frames: string[] = [];
  for (let i = 0; i < steps; i++) {
    frames.push(`${pct((LOOP_SECONDS * i) / steps)}%{d:path("${path1(outlineAt((LOOP_SECONDS * i) / steps))}")}`);
  }
  frames.push(`${pct(LOOP_SECONDS)}%{d:path("${path1(outlineAt(0))}")}`);
  return frames.join("");
}

/** The instants the eye TRANSFORM track has to be exact: the whole-second grid
 *  the body runs on, plus both ends of every morph, plus all three instants of
 *  every blink.
 *
 *  The body's own grid is far too coarse for a 0.45 s morph or a 0.18 s blink,
 *  and a 1 s keyframe spacing turns both into slow linear ramps. The transform
 *  is cheap to sample, so it gets its own, denser grid. */
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
 * The instants the eye SHAPE track has to be exact, which is a much shorter
 * list: the capsule only changes inside a morph, and stands still between two
 * of them.
 *
 * The `0` at the head of each morph is the one that is easy to leave out and
 * the one that matters most. Without a keyframe where the morph STARTS, the
 * browser has nothing to interpolate from but the previous hold, and ramps the
 * whole change across it — a five-second slide instead of a 0.45s turn, which
 * is the sluggishness this file is meant to have removed. A keyframe whose
 * value repeats the last one is not wasted bytes; it is what tells the browser
 * where the hold ended.
 *
 * Three points per morph then keep the engine's ease-out from reading as a
 * straight ramp: the browser interpolates linearly, and the quintic has moved
 * 92% of the way by 40% of the morph.
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

/** Percentage for an instant, and the same instant as a fraction of the loop.
 *  Every track closes on the value the FIRST frame holds, for the same reason
 *  `flickerKeyframes` does: `liveliness` floats the whole figure on a drift
 *  whose periods (7.9, 5.3, 3.4) divide nothing, so a real sample at t=24 is
 *  not the sample at t=0. It is off by a third of a unit in y, which is a
 *  seventh of a pixel here, and it is exactly the sort of thing that reads as
 *  "the loop twitches once a cycle" and nothing else. */
const share = (t: number) => r4((100 * t) / LOOP_SECONDS);

/** A track over `times`, whose final entry repeats the one at t=0. */
function over(times: number[], at: (t: number) => string): string {
  const frames = times.map((t) => `${share(t)}%{${at(t)}}`);
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
 * The eyes are cut in the mask rather than painted on top, so the mascot reads
 * the same on a light README as on a dark one. They blink about their own
 * middle: a fill-box origin is the one reference box with no ambiguity about
 * where it starts, and these are the only transforms left in the file.
 *
 * Each eye's shape and its look are ONE `animation` declaration, not two. Both
 * are the same property on the same element, and the `animation` shorthand
 * resets every longhand it does not mention: a rule per track means whichever
 * comes last silently erases the other, and the eye freezes on its t=0 matrix
 * while the `d` underneath it carries on. A comma-separated list is the way to
 * run two animations off one shorthand.
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
