import { describe, expect, test } from "bun:test";
import { ACCEL, MAX_SPEED, TURN_RATE, drift, type Bounds, type DriftState } from "./drift";

const ROOM: Bounds = { left: 278, top: 30, right: 1384, bottom: 777 };
const CENTRE = { x: 800, y: 400 };

/** Runs the drift for `seconds` at a steady 60fps and returns the final state. */
function run(from: DriftState, target: { x: number; y: number }, seconds: number, bounds = ROOM) {
  const step = 1 / 60;
  let state = from;
  let elapsed = 0;
  const path: DriftState[] = [];
  for (let t = 0; t < seconds; t += step) {
    state = drift(state, target, bounds, step, elapsed);
    elapsed += step;
    path.push(state);
  }
  return { state, path };
}

describe("drift", () => {
  test("it goes to where it was heading, then keeps wandering past it", () => {
    // It does not park. The turn radius is speed over turn rate, so the mascot
    // reaches its target, sails on, and comes back around - which is the whole
    // difference between something wandering and something being placed.
    const target = { x: 1100, y: 400 };
    const { state, path } = run({ ...CENTRE, heading: 0, speed: 0 }, target, 20);
    const distances = path.map((p) => Math.hypot(target.x - p.x, target.y - p.y));
    expect(Math.min(...distances)).toBeLessThan(8);
    expect(state.x).toBeGreaterThan(1000);
    expect(state.speed).toBeGreaterThan(0);
    // And the distances keep changing, so it is moving rather than circling a
    // fixed point.
    const late = distances.slice(-180);
    expect(Math.max(...late) - Math.min(...late)).toBeGreaterThan(20);
  });

  test("it never exceeds its speed or turn rate, whatever it is told", () => {
    // The whole feel of it is that it cannot be yanked around, so the ceilings
    // are the contract and a frame longer than a hitch must not break them.
    const from: DriftState = { x: 800, y: 400, heading: 0, speed: 0 };
    let state = from;
    for (let i = 0; i < 2000; i++) {
      // A target that jumps around every frame is the worst case for a turn rate.
      const target = { x: 300 + (i % 2) * 1000, y: 100 + (i % 3) * 300 };
      state = drift(state, target, ROOM, 0.5, i * 0.5);
      expect(state.speed).toBeLessThanOrEqual(MAX_SPEED + 0.001);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.heading)).toBe(true);
    }
    // A single frame may not turn further than the rate allows.
    const turned = drift(from, { x: 300, y: 100 }, ROOM, 0.1, 0);
    expect(Math.abs(turned.heading - from.heading)).toBeLessThanOrEqual(TURN_RATE * 0.1 + 1e-9);
    // And it may not accelerate faster than the rate allows.
    const accelerated = drift(from, { x: 1400, y: 400 }, ROOM, 0.1, 0);
    expect(accelerated.speed).toBeLessThanOrEqual(ACCEL * 0.1 + 1e-9);
  });

  test("it stays inside the room, turning off whatever it reaches", () => {
    // There is nothing to avoid in the room, but there is a window, and a blot
    // half off the edge reads as broken.
    const corners = [
      { x: ROOM.left - 400, y: ROOM.top - 400 },
      { x: ROOM.right + 400, y: ROOM.top - 400 },
      { x: ROOM.left - 400, y: ROOM.bottom + 400 },
      { x: ROOM.right + 400, y: ROOM.bottom + 400 },
    ];
    for (const target of corners) {
      const { path } = run({ ...CENTRE, heading: 0, speed: 0 }, target, 30);
      for (const point of path) {
        expect(point.x).toBeGreaterThanOrEqual(ROOM.left - 0.001);
        expect(point.x).toBeLessThanOrEqual(ROOM.right + 0.001);
        expect(point.y).toBeGreaterThanOrEqual(ROOM.top - 0.001);
        expect(point.y).toBeLessThanOrEqual(ROOM.bottom + 0.001);
      }
    }
  });

  test("the path is curved, not a straight line", () => {
    // This is the whole point of the rewrite. A straight line between two points
    // is what made the mascot read as a machine sliding, and a wander with no
    // curvature is the same drawing with softer easing.
    const { path } = run({ ...CENTRE, heading: 0, speed: 0 }, { x: 1200, y: 200 }, 14);
    // How far the path strays from the straight line joining its endpoints.
    const from = { x: CENTRE.x, y: CENTRE.y };
    const to = { x: 1200, y: 200 };
    const line = Math.hypot(to.x - from.x, to.y - from.y);
    const deviation = path.map((p) => {
      const t = Math.min(1, Math.max(0, ((p.x - from.x) * (to.x - from.x) + (p.y - from.y) * (to.y - from.y)) / (line * line)));
      return Math.hypot(p.x - (from.x + (to.x - from.x) * t), p.y - (from.y + (to.y - from.y) * t));
    });
    const worst = Math.max(...deviation);
    expect(worst).toBeGreaterThan(20);
  });

  test("two runs with the same target do not trace the same path", () => {
    const a = run({ ...CENTRE, heading: 0, speed: 0 }, { x: 1200, y: 250 }, 8).path;
    const b = run({ ...CENTRE, heading: Math.PI / 2, speed: 12 }, { x: 1200, y: 250 }, 8).path;
    const last = a.length - 1;
    expect(Math.hypot(a[last]!.x - b[last]!.x, a[last]!.y - b[last]!.y)).toBeGreaterThan(5);
  });

  test("a frame-time spike cannot teleport it", () => {
    // A long frame after a background tab or a GC pause must not throw the
    // mascot across the room, so the step is clamped rather than trusted.
    const from: DriftState = { x: 800, y: 400, heading: 0, speed: MAX_SPEED };
    const clamped = drift(from, { x: 1400, y: 400 }, ROOM, 30, 0);
    const honest = drift(from, { x: 1400, y: 400 }, ROOM, 0.05, 0);
    expect(clamped.x).toBeCloseTo(honest.x, 5);
  });
});

