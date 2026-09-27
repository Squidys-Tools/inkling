/**
 * How the mascot moves.
 *
 * It does not travel between points. It steers: a heading that turns toward
 * whatever it has decided to drift toward, limited by a turn rate, with the
 * speed easing in and out across a leg and a slow wander layered on top. The
 * result is a curved, unhurried path that never repeats and never looks like a
 * thing being teleported or a thing on rails.
 *
 * Pure and frame-rate independent: `drift` takes seconds, not milliseconds, and
 * returns a new state. The store calls it once per frame from the mascot's own
 * rAF loop, which is already running, so nothing here costs an extra animation
 * loop.
 */

export interface Vec {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DriftState {
  x: number;
  y: number;
  /** Current heading in radians. */
  heading: number;
  /** Current speed in px/s. */
  speed: number;
}

/** A calm amble. Fast enough to cross the library, slow enough to ignore. */
export const MAX_SPEED = 78;

/** How hard it can turn, in radians per second. The ceiling on everything. */
export const TURN_RATE = 1.15;

/** How fast it reaches the speed it wants, in px/s². */
export const ACCEL = 190;

/**
 * How far out it has to be before it travels at full pace, in px. Inside this
 * it eases down so it arrives rather than stops, which is what keeps a pass by
 * something from looking like it clipped it on the way.
 */
const LEG_EASE_DISTANCE = 190;


/**
 * The wander layered on top of the steering. Two slow sines at incommensurate
 * rates, so the heading never repeats on a cycle you could learn. This is the
 * whole difference between "a mascot that is somewhere" and "a mascot that is
 * wandering": without it the steering traces a clean arc between every pair of
 * points, which is exactly the mechanical look we are avoiding.
 */
function wanderOffset(seconds: number): number {
  return Math.sin(seconds * 0.63) * 0.42 + Math.cos(seconds * 0.37 + 1.7) * 0.3;
}

function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Keeps the mascot inside the room, turning it off whatever it just hit. */
function contain(state: DriftState, bounds: Bounds): DriftState {
  const pad = bounds.right - bounds.left;
  if (pad <= 0) return state;
  let { x, y, heading, speed } = state;
  if (x < bounds.left) {
    x = bounds.left;
    heading = Math.PI - heading;
  } else if (x > bounds.right) {
    x = bounds.right;
    heading = Math.PI - heading;
  }
  if (y < bounds.top) {
    y = bounds.top;
    heading = -heading;
  } else if (y > bounds.bottom) {
    y = bounds.bottom;
    heading = -heading;
  }
  return { x, y, heading, speed };
}

/**
 * One frame of drifting toward `target`.
 *
 * `seconds` is the frame's elapsed time and `elapsed` is the total time this
 * leg has been running; the wander is driven by the total, so it is continuous
 * across frames and unaffected by a slow or fast display.
 */
/**
 * The mascot never parks on its target. It gets there, keeps its floor speed,
 * and sails past on the wander, which is why a leg is ended by the controller's
 * duration rather than by arriving somewhere. There is no arrival test on
 * purpose: the turn radius is speed over turn rate, about 56px at a stroll, so
 * the mascot orbits its target rather than settling on it, and any "did it get
 * there" check would flicker.
 */
export function drift(state: DriftState, target: Vec, bounds: Bounds, seconds: number, elapsed: number): DriftState {
  const step = Math.min(seconds, 0.05);
  const dx = target.x - state.x;
  const dy = target.y - state.y;
  const distance = Math.hypot(dx, dy);

  // Ease down as it closes on the target and back up as it pulls away, so a leg
  // arrives rather than stops. An earlier version shaped this with a sine, which
  // is zero at both ends: the mascot crawled when it had far to go and sprinted
  // through the middle, which is the exact opposite of arriving.
  const eased = Math.min(1, distance / LEG_EASE_DISTANCE);
  const wanted = MAX_SPEED * (0.22 + 0.78 * eased);


  const desired = (distance > 0.001 ? Math.atan2(dy, dx) : state.heading) + wanderOffset(elapsed);
  const turn = clamp(shortestAngle(state.heading, desired), -TURN_RATE * step, TURN_RATE * step);
  const heading = state.heading + turn;
  const speed = state.speed + clamp(wanted - state.speed, -ACCEL * step, ACCEL * step);

  const moved = {
    x: state.x + Math.cos(heading) * speed * step,
    y: state.y + Math.sin(heading) * speed * step,
    heading,
    speed,
  };
  return contain(moved, bounds);
}


