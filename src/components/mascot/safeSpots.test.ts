import { describe, expect, test } from "bun:test";
import { createSeededRandom } from "./roam";
import {
  MASCOT_BODY,
  MASCOT_SIZE,
  findSafeSpot,
  isSafeSpot,
  lookTargets,
  nearestSafeSpot,
  roomAt,
  type Point,
  type Rect,
} from "./safeSpots";

/**
 * The real app's geometry, measured at 1414x807: a 248px sidebar, 48px of
 * padding either side of the library, a 50px capture bar, and a masonry grid
 * whose columns are 257px wide with 14px gutters. The library is dense, so what
 * is free is the band under the search bar and the margins beside the grid.
 */
const CONTAINER: Rect = { left: 248, top: 0, right: 1414, bottom: 807 };
const CAPTURE_BAR: Rect = { left: 296, top: 36, right: 1366, bottom: 86 };
const CARDS: Rect[] = [296, 567, 838, 1109].flatMap((left) =>
  [145, 480, 815].map((top) => ({ left, top, right: left + 257, bottom: top + 321 })),
);
const OBSTACLES = [...CARDS, CAPTURE_BAR];

/** Free space the mascot insists on between its ink and anything else. */
const MIN_ROOM = 6;

const box = (center: Point, size = MASCOT_BODY): Rect => ({
  left: center.x - size / 2,
  top: center.y - size / 2,
  right: center.x + size / 2,
  bottom: center.y + size / 2,
});

const hits = (a: Rect, b: Rect): boolean => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function samples(seed: number, prefer: "near" | "across" | "margin" | "any", from: Point, minRoom = 0): Point[] {
  const rand = createSeededRandom(seed);
  const out: Point[] = [];
  for (let i = 0; i < 200; i++) {
    const spot = findSafeSpot({ container: CONTAINER, obstacles: OBSTACLES, from, prefer, rand, minRoom });
    if (spot) out.push(spot);
  }
  return out;
}

describe("safe spots", () => {
  test("every spot lands on free space, inside the library and clear of a card", () => {
    const from = { x: 300, y: 115 };
    const found = samples(3, "any", from, MIN_ROOM);
    expect(found.length).toBe(200);
    for (const spot of found) {
      const rect = box(spot);
      expect(rect.left).toBeGreaterThanOrEqual(CONTAINER.left);
      expect(rect.right).toBeLessThanOrEqual(CONTAINER.right);
      expect(rect.top).toBeGreaterThanOrEqual(CONTAINER.top);
      expect(rect.bottom).toBeLessThanOrEqual(CONTAINER.bottom);
      for (const other of OBSTACLES) expect(hits(rect, other)).toBe(false);
      expect(roomAt(spot, CONTAINER, OBSTACLES)).toBeGreaterThanOrEqual(MIN_ROOM);
    }
  });

  test("a dense grid still leaves the lane and the margins, and never a sliver", () => {
    const lane = { x: 700, y: 115 };
    expect(isSafeSpot(lane, CONTAINER, OBSTACLES)).toBe(true);
    const found = samples(5, "any", lane, MIN_ROOM);
    expect(found.length).toBe(200);
    // The band under the search bar, and the margins beside the grid. Nothing
    // stands where the cards are, and nothing squeezes into a 14px gutter.
    expect(found.some((spot) => spot.y < 145)).toBe(true);
    expect(found.some((spot) => spot.x < 296 || spot.x > 1366)).toBe(true);
    for (const spot of found) {
      expect(spot.x > 296 && spot.x < 1366 && spot.y > 145).toBe(false);
    }
  });

  test("no room means no spot, never a fallback position on top of a card", () => {
    const full: Rect = { left: 248, top: 145, right: 1366, bottom: 777 };
    const covered = [...CARDS, full];
    expect(findSafeSpot({ container: full, obstacles: covered, from: { x: 700, y: 400 }, prefer: "any", rand: createSeededRandom(1) })).toBeNull();
    expect(nearestSafeSpot(full, covered, { x: 700, y: 400 })).toBeNull();
    expect(isSafeSpot({ x: 700, y: 400 }, full, covered)).toBe(false);
  });

  test("a preference that cannot be met falls back to whatever is open", () => {
    // 100px wide cannot be crossed, but there is room to stand in it.
    const narrow: Rect = { left: 0, top: 0, right: 100, bottom: 400 };
    const search = { container: narrow, obstacles: [], from: { x: 50, y: 200 } };
    expect(findSafeSpot({ ...search, prefer: "across", rand: createSeededRandom(9) })).toBeNull();
    expect(findSafeSpot({ ...search, prefer: "any", rand: createSeededRandom(9) })).not.toBeNull();
  });

  test("near stays a short hop and across lands on the far side", () => {
    const from = { x: 700, y: 115 };
    for (const spot of samples(11, "near", from)) {
      const d = Math.hypot(spot.x - from.x, spot.y - from.y);
      expect(d).toBeGreaterThanOrEqual(MASCOT_SIZE * 1.6 - 1);
      expect(d).toBeLessThanOrEqual(MASCOT_SIZE * 6 + 1);
    }
    for (const spot of samples(13, "across", { x: 300, y: 115 })) {
      expect(Math.abs(spot.x - 300)).toBeGreaterThanOrEqual((CONTAINER.right - CONTAINER.left) * 0.4);
    }
    for (const spot of samples(17, "margin", from)) {
      const edge = Math.min(spot.x - CONTAINER.left, spot.y - CONTAINER.top, CONTAINER.right - spot.x, CONTAINER.bottom - spot.y);
      expect(edge).toBeLessThanOrEqual(MASCOT_SIZE * 2.2);
    }
  });

  test("repeated searches do not repeat the same lattice", () => {
    const found = samples(19, "any", { x: 700, y: 115 });
    const distinct = new Set(found.map((spot) => `${Math.round(spot.x)}:${Math.round(spot.y)}`));
    expect(distinct.size).toBeGreaterThan(found.length / 2);
  });

  test("the nearest safe spot is the one next door, and none exists when nothing fits", () => {
    // Standing in the left margin, a card is a scroll away. The fix has to be
    // the margin right there, not the far side of the library.
    const from = { x: 300, y: 400 };
    const safe = nearestSafeSpot(CONTAINER, OBSTACLES, from, MASCOT_BODY, MIN_ROOM)!;
    expect(safe).not.toBeNull();
    expect(isSafeSpot(safe, CONTAINER, OBSTACLES, MASCOT_BODY, MIN_ROOM)).toBe(true);
    expect(Math.hypot(safe.x - from.x, safe.y - from.y)).toBeLessThan(MASCOT_SIZE);
  });

  test("a margin too narrow for the coarse grid is still found", () => {
    // The real app's right margin is 48px, which leaves a five-pixel window for
    // the mascot's centre once its body and the air it wants are taken out. With
    // a 1006px container the coarse grid steps straight over that window, and
    // only the finer pass finds the margin — so the mascot would never leave
    // home at that width.
    const container: Rect = { left: 0, top: 0, right: 1006, bottom: 600 };
    const obstacles: Rect[] = [{ left: 0, top: 0, right: 958, bottom: 600 }];
    const from = { x: 500, y: 300 };
    const found = findSafeSpot({ container, obstacles, from, prefer: "any", rand: createSeededRandom(2), minRoom: MIN_ROOM });
    expect(found).not.toBeNull();
    expect(isSafeSpot(found!, container, obstacles, MASCOT_BODY, MIN_ROOM)).toBe(true);
    const nearest = nearestSafeSpot(container, obstacles, from, MASCOT_BODY, MIN_ROOM);
    expect(nearest).not.toBeNull();
    expect(isSafeSpot(nearest!, container, obstacles, MASCOT_BODY, MIN_ROOM)).toBe(true);
  });

  test("a huge window still finds its margin, at whatever lattice it needs", () => {
    // The candidate lattice is bounded so a search cannot stall the mascot's own
    // frame, which means the step grows with the window. A 48px margin on a 4K
    // window is then well under one step wide, and only the finer pass finds it.
    const container: Rect = { left: 0, top: 0, right: 2560, bottom: 1400 };
    const cards: Rect[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 6; col++) {
        cards.push({ left: 48 + col * 400, top: 145 + row * 250, right: 48 + col * 400 + 380, bottom: 145 + row * 250 + 240 });
      }
    }
    const obstacles: Rect[] = [...cards, { left: 48, top: 36, right: 2512, bottom: 86 }];
    const from = { x: 1280, y: 115 };
    const found = findSafeSpot({ container, obstacles, from, prefer: "any", rand: createSeededRandom(4), minRoom: MIN_ROOM });
    expect(found).not.toBeNull();
    expect(isSafeSpot(found!, container, obstacles, MASCOT_BODY, MIN_ROOM)).toBe(true);
    const nearest = nearestSafeSpot(container, obstacles, from, MASCOT_BODY, MIN_ROOM);
    expect(nearest).not.toBeNull();
    expect(isSafeSpot(nearest!, container, obstacles, MASCOT_BODY, MIN_ROOM)).toBe(true);
  });

  test("a single big card leaves the margins and nothing else, the way Serendipity does", () => {
    // Serendipity shows one item filling the stage, with Keep, Forget and Details
    // on it. If that card is measured as an obstacle the only free space left is
    // the margins, and the mascot stays out on them. If it is missed entirely,
    // the whole stage reads as walkable floor and the mascot lands on the
    // buttons. The geometry has to hold the answer either way, so this pins the
    // shape rather than the selector that feeds it.
    const container: Rect = { left: 248, top: 0, right: 1414, bottom: 807 };
    const stage: Rect = { left: 296, top: 145, right: 1366, bottom: 720 };
    const obstacles: Rect[] = [stage, { left: 296, top: 36, right: 1366, bottom: 86 }];
    const rand = createSeededRandom(9);
    for (let i = 0; i < 200; i++) {
      const spot = findSafeSpot({ container, obstacles, from: { x: 400, y: 400 }, prefer: "any", rand, minRoom: MIN_ROOM });
      expect(spot).not.toBeNull();
      expect(hits(box(spot!), stage)).toBe(false);
    }
    // With the card gone the stage is floor again, which is what makes the
    // missing-card case a bug rather than a preference.
    const withoutCard = findSafeSpot({
      container,
      obstacles: [obstacles[1]!],
      from: { x: 800, y: 400 },
      prefer: "any",
      rand: createSeededRandom(9),
      minRoom: MIN_ROOM,
    });
    expect(withoutCard).not.toBeNull();
    expect(hits(box(withoutCard!), stage)).toBe(true);
  });

  test("a clear-path search never picks a spot it would have to cross the grid to reach", () => {
    // The free space is a ring, so plenty of free spots are on the far side of
    // the grid from where the mascot stands. Reaching one means gliding over
    // every card in between, which is the thing the geometry exists to prevent.
    // The only lanes the real library leaves free are the two 48px margins beside
    // the grid and the band under the capture bar. Start in the left one.
    const from = { x: 272, y: 400 };
    const near = { x: 272, y: 200 };
    const far = { x: 1390, y: 400 };
    expect(isSafeSpot(from, CONTAINER, OBSTACLES, MASCOT_BODY, MIN_ROOM)).toBe(true);
    expect(isSafeSpot(near, CONTAINER, OBSTACLES, MASCOT_BODY, MIN_ROOM)).toBe(true);
    expect(isSafeSpot(far, CONTAINER, OBSTACLES, MASCOT_BODY, MIN_ROOM)).toBe(true);
    // Every spot a clear-path search returns is genuinely reachable on foot.
    const rand = createSeededRandom(21);
    for (let i = 0; i < 120; i++) {
      const spot = findSafeSpot({ container: CONTAINER, obstacles: OBSTACLES, from, prefer: "any", rand, minRoom: MIN_ROOM, clearPath: true });
      if (!spot) continue;
      // Sample the walk the way clearPath does, independently of it.
      const steps = 40;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const mid = { x: from.x + (spot.x - from.x) * t, y: from.y + (spot.y - from.y) * t };
        expect(roomAt(mid, CONTAINER, OBSTACLES, MASCOT_BODY)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("dropping the clear-path demand still allows a spot on the far margin", () => {
    // Recovery runs from wherever the mascot ended up, so it cannot demand a
    // route: after a scroll the mascot is standing on a card and any improvement
    // is worth a glide.
    const from = { x: 272, y: 400 };
    const unreachable = findSafeSpot({ container: CONTAINER, obstacles: OBSTACLES, from, prefer: "across", rand: createSeededRandom(2), minRoom: MIN_ROOM });
    expect(unreachable).not.toBeNull();
    const reachable = findSafeSpot({ container: CONTAINER, obstacles: OBSTACLES, from, prefer: "any", rand: createSeededRandom(2), minRoom: MIN_ROOM, clearPath: true });
    expect(reachable).not.toBeNull();
    expect(Math.abs(reachable!.x - from.x)).toBeLessThan(Math.abs(unreachable!.x - from.x));
  });

  test("look targets are the cards you can see, nearest first", () => {
    const targets = lookTargets(CONTAINER, CARDS, { x: 300, y: 115 });
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target.x).toBeGreaterThan(CONTAINER.left);
      expect(target.x).toBeLessThan(CONTAINER.right);
    }
    const distances = targets.map((target) => Math.hypot(target.x - 300, target.y - 115));
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    // A card scrolled out of the library is not something to look at.
    const offScreen: Rect = { left: 296, top: 2_000, right: 553, bottom: 2_321 };
    expect(lookTargets(CONTAINER, [offScreen], { x: 300, y: 115 })).toHaveLength(0);
  });
});

