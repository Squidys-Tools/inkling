/**
 * How the mascot moves.
 *
 * It does not steer toward points. It picks a direction and goes that way, which
 * is what makes it read as a creature wandering rather than an app animating a
 * sprite between coordinates. Three things shape the motion:
 *
 * - a heading that turns at a limited rate toward whatever direction it was last
 *   asked to go, so a change of mind is a curve and not a corner;
 * - a slow sway layered onto the velocity, small enough to be felt rather than
 *   seen, which is the difference between "drifting" and "travelling in a
 *   straight line";
 * - the walls. The card grid is a wall, not a filter. The mascot slides along it
 *   the way anything moving through a room does, so it can never end up over a
 *   card without anything having to decide that it should not.
 *
 * Pure and frame-rate independent: `drift` takes seconds and returns a new state.
 * The store calls it once per frame from the mascot engine's own rAF, which is
 * already running, so continuous movement costs no additional loop.
 */

import { DEMI_VIEWBOX, RAYON } from "./bot/repere";


/** The one size the mascot is drawn at, in every slot and in the library. */
export const MASCOT_SIZE = 44;

/**
 * What actually has to fit, which is the ink and not the drawing box. The engine
 * paints the body on a sphere of RAYON inside a viewBox of DEMI_VIEWBOX, and the
 * splash peaks a shade past the radius, so the blot covers about 63% of the box
 * it is drawn in. A little is added back for the idle drift. Measuring against
 * the box instead would refuse every lane this library actually has.
 */
const MASCOT_BODY = Math.ceil((2 * 1.06 * RAYON * MASCOT_SIZE) / (2 * DEMI_VIEWBOX) + 1);

/**
 * How close the mascot's centre has to stay to a wall for its ink to miss it.
 * Every wall is inflated by this before the drift sees it, because a test on the
 * centre alone puts the ink straight over a card the moment the lane is narrower
 * than the mascot: the margins either side of a four column grid are about as
 * wide as the blot is wide, so the centre test passes and the blot does not.
 */
export const BODY_RADIUS = MASCOT_BODY / 2;


export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Position and velocity. A velocity rather than a heading, so it can slide. */
export interface DriftState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * A amble. Slow enough to ignore, and slow enough that the sway reads as drift
 * rather than as a wobble on a fast pass.
 */
export const CRUISE_SPEED = 30;

/** How fast it can change its mind, in radians per second. */
export const TURN_RATE = 0.55;

/**
 * How far the sway pushes off the intended direction, in radians. Seven degrees
 * is about a tenth of a right angle: enough that a long straight pass looks like
 * something alive, little enough that it still reads as going somewhere.
 */
export const SWAY_AMPLITUDE = 0.12;

/** The two rates the sway runs at. Incommensurate, so it never repeats. */
const SWAY_RATE_A = 0.37;
const SWAY_RATE_B = 0.23;

/** The room it is in, and everything inside the room it cannot be inside. */
export interface Terrain {
  room: Rect;
  walls: Rect[];
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** A direction to set off in, anywhere on the circle. */
export function pickDirection(rand: () => number): number {
  return rand() * Math.PI * 2;
}

/**
 * The sway, as a perpendicular nudge. Driven by total elapsed time on two rates
 * that do not divide into each other, so no two outings trace the same line and
 * the mascot cannot learn a rhythm.
 */
function sway(elapsed: number, phase: number): number {
  return (
    Math.sin(elapsed * SWAY_RATE_A + phase) * 0.7 +
    Math.cos(elapsed * SWAY_RATE_B + phase * 1.7) * 0.3
  );
}

/**
 * One frame.
 *
 * `aim` is the direction it was last told to head in, or null to carry on in
 * whatever direction it is already going. `cruise` scales the pace for this leg,
 * so consecutive legs differ without the speed ever jumping.
 */
export function drift(
  state: DriftState,
  terrain: Terrain,
  seconds: number,
  elapsed: number,
  aim: number | null,
  cruise = CRUISE_SPEED,
  phase = 0,
): DriftState {
  const step = Math.min(seconds, 0.05);

  let speed = Math.hypot(state.vx, state.vy);
  let heading = speed > 0.001 ? Math.atan2(state.vy, state.vx) : aim ?? 0;

  if (aim !== null) {
    // Turn toward the aim at a limited rate. A change of mind is a curve.
    const turn = clamp(shortestAngle(heading, aim), -TURN_RATE * step, TURN_RATE * step);
    heading += turn;
  }
  // Ease the pace rather than snapping to it, so a leg never starts with a lurch.
  const wanted = cruise * (0.55 + 0.45 * Math.min(1, speed / Math.max(1, cruise)));
  speed += clamp(wanted - speed, -cruise * 1.6 * step, cruise * 1.6 * step);

  // The sway, perpendicular to travel, so it never fights the aim.
  heading += sway(elapsed, phase) * SWAY_AMPLITUDE * step * 12;

  let x = state.x + Math.cos(heading) * speed * step;
  let y = state.y + Math.sin(heading) * speed * step;
  let vx = Math.cos(heading) * speed;
  let vy = Math.sin(heading) * speed;

  // The room. Reflect the normal component, which is a slide, not a stop.
  const pad = 6;
  if (x < terrain.room.left + pad) { x = terrain.room.left + pad; vx = Math.abs(vx); }
  if (x > terrain.room.right - pad) { x = terrain.room.right - pad; vx = -Math.abs(vx); }
  if (y < terrain.room.top + pad) { y = terrain.room.top + pad; vy = Math.abs(vy); }
  if (y > terrain.room.bottom - pad) { y = terrain.room.bottom - pad; vy = -Math.abs(vy); }

  // The walls, which at the moment is the card grid. Steps are a fraction of a
  // pixel at this pace, so nothing can tunnel through one.
  for (const wall of terrain.walls) {
    if (x <= wall.left || x >= wall.right || y <= wall.top || y >= wall.bottom) continue;
    const outLeft = x - wall.left;
    const outRight = wall.right - x;
    const outTop = y - wall.top;
    const outBottom = wall.bottom - y;
    const least = Math.min(outLeft, outRight, outTop, outBottom);
    if (least === outLeft) { x = wall.left; vx = -Math.abs(vx); }
    else if (least === outRight) { x = wall.right; vx = Math.abs(vx); }
    else if (least === outTop) { y = wall.top; vy = -Math.abs(vy); }
    else { y = wall.bottom; vy = Math.abs(vy); }
  }

  return { x, y, vx, vy };
}

/** Current speed, for the dev readout. */
export function speedOf(state: DriftState): number {
  return Math.hypot(state.vx, state.vy);
}

/** The direction it is currently heading, for the dev board. */
export function headingOf(state: DriftState): number {
  return Math.atan2(state.vy, state.vx);
}


