import { describe, expect, test } from "bun:test";
import { createSeededRandom } from "./roam";
import { farPoint, freeArea, freePoint, hasRoom, lookTargets, terrainFor, type Rect } from "./roamSpace";
import { BODY_RADIUS } from "./drift";
import type { Terrain } from "./drift";

/** The real app at 1414x807: a 248px sidebar, a four-column grid, 48px of padding. */
const PANEL: Rect = { left: 248, top: 0, right: 1414, bottom: 807 };
const GRID: Rect = { left: 296, top: 145, right: 1366, bottom: 801 };
const TERRAIN = terrainFor(PANEL, [GRID]);
const CARDS: Rect[] = [296, 567, 838, 1109].flatMap((left) =>
  [145, 480, 815].map((top) => ({ left, top, right: left + 257, bottom: top + 321 })),
);

const overGrid = (p: { x: number; y: number }, terrain: Terrain = TERRAIN) =>
  terrain.walls.some((w) => p.x > w.left && p.x < w.right && p.y > w.top && p.y < w.bottom);

const inRoom = (p: { x: number; y: number }, terrain: Terrain = TERRAIN) =>
  p.x >= terrain.room.left && p.x <= terrain.room.right && p.y >= terrain.room.top && p.y <= terrain.room.bottom;

describe("roam space", () => {
  test("the room is the whole panel, and the grid is a wall inside it", () => {
    expect(TERRAIN.room.left).toBeGreaterThan(PANEL.left);
    expect(TERRAIN.room.right).toBeLessThan(PANEL.right);
    expect(TERRAIN.walls).toHaveLength(1);
    // The wall is the grid grown by the body radius, so a centre that clears it
    // clears the ink. A test on the centre alone passes in a margin narrower than
    // the mascot and puts the blot on top of a card while reporting all clear.
    const wall = TERRAIN.walls[0]!;
    expect(wall.left).toBe(GRID.left - BODY_RADIUS);
    expect(wall.right).toBe(GRID.right + BODY_RADIUS);
    expect(wall.top).toBe(GRID.top - BODY_RADIUS);
    expect(wall.bottom).toBe(TERRAIN.room.bottom);
    expect(hasRoom(TERRAIN)).toBe(true);
  });

  test("a free point is never closer to a wall than the mascot is wide", () => {
    // The property that actually keeps the blot off the cards, checked against
    // the geometry rather than against a browser.
    const rand = createSeededRandom(31);
    for (let i = 0; i < 500; i++) {
      const p = freePoint(TERRAIN, rand)!;
      for (const wall of TERRAIN.walls) {
        const insideX = p.x > wall.left && p.x < wall.right;
        const insideY = p.y > wall.top && p.y < wall.bottom;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  test("the free space is a corridor, and it is small", () => {
    // Worth knowing rather than discovering: a four column grid leaves margins
    // about as wide as the mascot, so what is left is two narrow rails and the
    // band under the search bar. The mascot can roam all of it, but "the whole
    // library" is a corridor here, not an open floor.
    const area = freeArea(TERRAIN);
    const roomArea = (TERRAIN.room.right - TERRAIN.room.left) * (TERRAIN.room.bottom - TERRAIN.room.top);
    expect(area).toBeGreaterThan(0);
    expect(area / roomArea).toBeLessThan(0.25);
  });


  test("every free point is inside the room and off the cards", () => {
    const rand = createSeededRandom(3);
    for (let i = 0; i < 400; i++) {
      const point = freePoint(TERRAIN, rand)!;
      expect(point).not.toBeNull();
      expect(inRoom(point)).toBe(true);
      expect(overGrid(point)).toBe(false);
    }
  });

  test("the free space is the margins and the band, and the space below a short grid", () => {
    const rand = createSeededRandom(5);
    // Counts where the points landed relative to a given grid, since the short
    // library below is not the same rectangle as the full one.
    const count = (terrain: Terrain, grid: Rect) => {
      const out = { left: 0, right: 0, above: 0, below: 0 };
      for (let i = 0; i < 600; i++) {
        const p = freePoint(terrain, rand)!;
        if (p.x < grid.left) out.left++;
        if (p.x > grid.right) out.right++;
        if (p.y < grid.top) out.above++;
        if (p.y > grid.bottom) out.below++;
      }
      return out;
    };
    // A full library, whose last row runs off the bottom of the viewport, so the
    // only free space is the two margins and the band under the search bar.
    const full = count(TERRAIN, GRID);
    expect(full.left).toBeGreaterThan(0);
    expect(full.right).toBeGreaterThan(0);
    expect(full.above).toBeGreaterThan(0);
    expect(full.below).toBe(0);

    // A short library leaves room underneath, and the mascot uses it.
    const shortGrid: Rect = { left: 296, top: 145, right: 1366, bottom: 480 };
    const short = terrainFor(PANEL, [shortGrid]);
    expect(count(short, shortGrid).below).toBeGreaterThan(0);
  });

  test("a relocation is somewhere else, not next door", () => {
    const rand = createSeededRandom(7);
    const from = { x: 320, y: 400 };
    let far = 0;
    for (let i = 0; i < 200; i++) {
      const p = farPoint(TERRAIN, from, rand)!;
      expect(p).not.toBeNull();
      expect(inRoom(p)).toBe(true);
      expect(overGrid(p)).toBe(false);
      if (Math.hypot(p.x - from.x, p.y - from.y) > 400) far++;
    }
    expect(far).toBeGreaterThan(150);
  });

  test("a grid that fills the panel leaves nowhere, and the mascot stays home", () => {
    const filled = terrainFor(PANEL, [{ left: PANEL.left, top: PANEL.top, right: PANEL.right, bottom: PANEL.bottom }]);
    expect(hasRoom(filled)).toBe(false);
  });

  test("a library with no grid laid out yet is an empty room", () => {
    const none = terrainFor(PANEL, []);
    expect(none.walls).toHaveLength(0);
    expect(hasRoom(none)).toBe(true);
  });

  test("a grid entirely outside the panel is not a wall", () => {
    const stray = terrainFor(PANEL, [{ left: 5_000, top: 5_000, right: 6_000, bottom: 6_000 }]);
    expect(stray.walls).toHaveLength(0);
  });

  test("the control strips are walls too, not just the cards", () => {
    // A mascot drifting across the search field or the Add button does not block
    // the click, but it hides what you were aiming at. The strips are walls for
    // the same reason the grid is.
    const captureBar: Rect = { left: 296, top: 36, right: 1366, bottom: 86 };
    const withControls = terrainFor(PANEL, [GRID, captureBar]);
    expect(withControls.walls).toHaveLength(2);
    const rand = createSeededRandom(13);
    for (let i = 0; i < 300; i++) {
      const p = freePoint(withControls, rand)!;
      expect(p.y > captureBar.top && p.y < captureBar.bottom && p.x > captureBar.left && p.x < captureBar.right).toBe(false);
    }
  });

  test("a blocker outside the room is dropped rather than shrinking the room", () => {
    const outside = terrainFor(PANEL, [{ left: 5_000, top: 5_000, right: 6_000, bottom: 6_000 }, null]);
    expect(outside.walls).toHaveLength(0);
    expect(outside.room).toEqual(TERRAIN.room);
  });

  test("look targets are the cards you can see, nearest first", () => {

    const targets = lookTargets(PANEL, CARDS, { x: 300, y: 115 });
    expect(targets.length).toBeGreaterThan(0);
    const distances = targets.map((t) => Math.hypot(t.x - 300, t.y - 115));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    const offScreen: Rect = { left: 296, top: 2_000, right: 553, bottom: 2_321 };
    expect(lookTargets(PANEL, [offScreen], { x: 300, y: 115 })).toHaveLength(0);
  });
});


