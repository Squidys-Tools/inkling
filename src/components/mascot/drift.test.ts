import { describe, expect, test } from "bun:test";
import {
  CRUISE_SPEED,
  MASCOT_SIZE,
  SWAY_AMPLITUDE,
  TURN_RATE,
  drift,
  headingOf,
  speedOf,
  type DriftState,
  type Rect,
  type Terrain,
} from "./drift";

/** A 1166x807 library with a four-column grid in the middle, as the app lays it out. */
const ROOM: Rect = { left: 270, top: 22, right: 1392, bottom: 785 };

const GRID: Rect = { left: 296, top: 145, right: 1366, bottom: 801 };
const TERRAIN: Terrain = { room: ROOM, walls: [GRID] };

const inMargin = (p: { x: number; y: number }) =>
  !(p.x > GRID.left && p.x < GRID.right && p.y > GRID.top && p.y < GRID.bottom);

function run(from: DriftState, aim: number | null, seconds: number, terrain = TERRAIN, cruise = CRUISE_SPEED) {
  const step = 1 / 60;
  let state = from;
  const path: DriftState[] = [];
  for (let t = 0; t < seconds; t += step) {
    state = drift(state, terrain, step, t, aim, cruise, 0);
    path.push(state);
  }
  return { state, path };
}

describe("drift", () => {
  test("it goes the way it was pointed, and turns at a limited rate", () => {
    const start: DriftState = { x: 700, y: 400, vx: 0, vy: 0 };
    const right = drift(start, TERRAIN, 0.1, 0, 0, CRUISE_SPEED, 0);
    expect(right.vx).toBeGreaterThan(0);
    expect(Math.abs(right.vy)).toBeLessThan(0.5);
    // A change of mind is a curve, not a corner: one frame may not turn further
    // than the rate allows, however far the aim is from where it was heading.
    const reversed = drift({ ...start, vx: 60, vy: 0 }, TERRAIN, 0.1, 0, Math.PI, CRUISE_SPEED, 0);
    const turned = Math.abs(headingOf(reversed) - headingOf({ ...start, vx: 60, vy: 0 }));
    expect(turned).toBeLessThanOrEqual(TURN_RATE * 0.1 + 1e-9);
  });

  test("it never goes over the grid, however long it drifts", () => {
    // The grid is a wall, not a filter: the mascot is given a direction that aims
    // straight at the cards and has to slide along them instead.
    for (let i = 0; i < 12; i++) {
      const aim = (i / 12) * Math.PI * 2;
      const start: DriftState = { x: 700, y: 120, vx: 0, vy: 0 };
      const { path } = run(start, aim, 90);
      for (const point of path) {
        expect(inMargin(point)).toBe(true);
      }
    }
  });

  test("it stays inside the room as well as out of the grid", () => {
    const { path } = run({ x: 300, y: 400, vx: 0, vy: 0 }, Math.PI, 60);
    for (const point of path) {
      expect(point.x).toBeGreaterThanOrEqual(ROOM.left - 0.001);
      expect(point.y).toBeGreaterThanOrEqual(ROOM.top - 0.001);
      expect(point.y).toBeLessThanOrEqual(ROOM.bottom + 0.001);
    }
  });

  test("the path is mostly straight, with only a little sway", () => {
    // Aims dead down, and measures how far the path strays from that line. A
    // creature wandering has a few degrees of drift on it; a decorative curve
    // would be tens of degrees and read as a designed swoop.
    const start: DriftState = { x: 700, y: 60, vx: 0, vy: 0 };
    const { path } = run(start, 0, 12);
    const maxStray = Math.max(...path.map((p) => Math.abs(p.y - 60)));
    // Aims right, so allow sway in the perpendicular axis only.
    const across = run({ x: 280, y: 400, vx: 0, vy: 0 }, 0, 10);
    const maxAcross = Math.max(...across.path.map((p) => Math.abs(p.y - 400)));
    expect(maxStray).toBeLessThan(140);
    expect(maxAcross).toBeLessThan(140);
    // And it is genuinely not a ruler-straight line, or there would be no sway.
    expect(maxAcross).toBeGreaterThan(3);
    expect(SWAY_AMPLITUDE).toBeLessThan(0.2);
  });

  test("it is slow, and never faster than the cruise it was given", () => {
    expect(CRUISE_SPEED).toBeLessThanOrEqual(40);
    const { path } = run({ x: 280, y: 400, vx: 0, vy: 0 }, 0, 30);
    for (const point of path) {
      expect(speedOf(point)).toBeLessThanOrEqual(CRUISE_SPEED * 1.05);
    }
    // A leg that has been going a while sits near its cruise, not near zero.
    const settled = speedOf(path[path.length - 1]!);
    expect(settled).toBeGreaterThan(CRUISE_SPEED * 0.7);
  });

  test("a wall deflects it and it carries on along the wall", () => {
    // Aimed into the top edge of the grid from the band above. Pinned flat against
    // a wall it would look stuck, so the deflection is the interesting part: the
    // normal component is gone and the tangential one carries it along.
    const start: DriftState = { x: 700, y: 100, vx: 0, vy: 0 };
    const { path } = run(start, Math.PI / 2, 25);
    for (const point of path) expect(inMargin(point)).toBe(true);
    const last = path[path.length - 1]!;
    // It never pushed into the grid.
    expect(last.y).toBeLessThanOrEqual(GRID.top + 0.001);
    // And it travelled along the edge rather than sitting on it.
    expect(Math.abs(last.x - start.x)).toBeGreaterThan(150);
    expect(speedOf(last)).toBeGreaterThan(CRUISE_SPEED * 0.5);
  });


  test("no aim means it carries on in its own direction", () => {
    const drifting: DriftState = { x: 280, y: 400, vx: 40, vy: 0 };
    const before = headingOf(drifting);
    const after = headingOf(drift(drifting, TERRAIN, 0.1, 0, null, CRUISE_SPEED, 0));
    expect(Math.abs(after - before)).toBeLessThan(0.2);
  });

  test("a frame-time spike cannot fling it across the room", () => {
    // A long frame after a background tab or a GC pause must not teleport the
    // mascot, so the step is clamped rather than trusted.
    const start: DriftState = { x: 280, y: 400, vx: 45, vy: 0 };
    const spike = drift(start, TERRAIN, 30, 0, 0, CRUISE_SPEED, 0);
    const honest = drift(start, TERRAIN, 0.05, 0, 0, CRUISE_SPEED, 0);
    expect(spike.x).toBeCloseTo(honest.x, 5);
  });

  test("an empty room with no walls still behaves", () => {
    // A library with no grid laid out yet: nothing to avoid, and it still drifts.
    const open: Terrain = { room: ROOM, walls: [] };
    const { state } = run({ x: 700, y: 400, vx: 0, vy: 0 }, 0.7, 10, open);
    expect(speedOf(state)).toBeGreaterThan(0);
    expect(state.x).toBeGreaterThan(ROOM.left);
  });

  test("the mascot is drawn at one size everywhere", () => {
    expect(MASCOT_SIZE).toBe(44);
  });
});

