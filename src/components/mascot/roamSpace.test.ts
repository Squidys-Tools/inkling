import { describe, expect, test } from "bun:test";
import { createSeededRandom } from "./roam";
import { pickTarget, lookTargets, roamBounds, type Bounds } from "./roamSpace";

/** The real app's geometry at 1414x807: a 248px sidebar, 48px of padding. */
const PANEL: Bounds = { left: 248, top: 0, right: 1414, bottom: 807 };
const ROOM = roamBounds(PANEL);
const CARDS: Bounds[] = [296, 567, 838, 1109].flatMap((left) =>
  [145, 480, 815].map((top) => ({ left, top, right: left + 257, bottom: top + 321 })),
);

const inside = (point: { x: number; y: number }, room: Bounds = ROOM) =>
  point.x >= room.left && point.x <= room.right && point.y >= room.top && point.y <= room.bottom;

describe("roam space", () => {
  test("the room is the library, inset off the window edges", () => {
    expect(ROOM.left).toBe(PANEL.left + 30);
    expect(ROOM.right).toBe(PANEL.right - 30);
    expect(ROOM.top).toBe(PANEL.top + 30);
    expect(ROOM.bottom).toBe(PANEL.bottom - 30);
    expect(ROOM.right - ROOM.left).toBeGreaterThan(1000);
  });

  test("every preference lands inside the room, and nothing is ever refused", () => {
    // The mascot is pointer-events: none, so it cannot take a click. That is the
    // only rule it has, and it means there is no spot the geometry can reject -
    // which is what used to confine it to a single margin.
    const from = { x: 700, y: 400 };
    for (const prefer of ["near", "across", "edge", "any"] as const) {
      const rand = createSeededRandom(3);
      for (let i = 0; i < 300; i++) {
        const target = pickTarget(ROOM, from, prefer, rand);
        expect(inside(target)).toBe(true);
      }
    }
  });

  test("the mascot can reach the whole width and height, not one column", () => {
    // The old geometry could only offer spots in the margins beside the grid.
    const from = { x: 272, y: 400 };
    const rand = createSeededRandom(7);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 400; i++) {
      const target = pickTarget(ROOM, from, "any", rand);
      xs.push(target.x);
      ys.push(target.y);
    }
    expect(Math.min(...xs)).toBeLessThan(500);
    expect(Math.max(...xs)).toBeGreaterThan(1100);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(600);
  });

  test("a crossing lands in the far half of the room", () => {
    const rand = createSeededRandom(11);
    let far = 0;
    for (let i = 0; i < 200; i++) {
      const from = { x: 300, y: 400 };
      const target = pickTarget(ROOM, from, "across", rand);
      expect(inside(target)).toBe(true);
      if (target.x > 900) far++;
    }
    expect(far).toBeGreaterThan(180);
  });

  test("a short hop stays in the neighbourhood", () => {
    const from = { x: 700, y: 400 };
    const rand = createSeededRandom(13);
    for (let i = 0; i < 200; i++) {
      const target = pickTarget(ROOM, from, "near", rand);
      expect(Math.hypot(target.x - from.x, target.y - from.y)).toBeLessThan(320);
    }
  });

  test("a drift to the margins lands near one", () => {
    const from = { x: 700, y: 400 };
    const rand = createSeededRandom(17);
    let onEdge = 0;
    for (let i = 0; i < 200; i++) {
      const target = pickTarget(ROOM, from, "edge", rand);
      const edge = Math.min(
        target.x - ROOM.left,
        target.y - ROOM.top,
        ROOM.right - target.x,
        ROOM.bottom - target.y,
      );
      if (edge < 1) onEdge++;
    }
    expect(onEdge).toBeGreaterThan(190);
  });

  test("look targets are the cards you can see, nearest first", () => {
    const targets = lookTargets(PANEL, CARDS, { x: 300, y: 115 });
    expect(targets.length).toBeGreaterThan(0);
    const distances = targets.map((t) => Math.hypot(t.x - 300, t.y - 115));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    const offScreen: Bounds = { left: 296, top: 2_000, right: 553, bottom: 2_321 };
    expect(lookTargets(PANEL, [offScreen], { x: 300, y: 115 })).toHaveLength(0);
  });
});
