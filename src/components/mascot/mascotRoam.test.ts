import { describe, expect, test } from "bun:test";
import {
  createRoamState,
  findRoamSpots,
  forceRoamStart,
  roamTick,
  seededRoamRandom,
  type RoamContext,
  type RoamRect,
  type RoamState,
} from "./mascotRoam";

const frame: RoamRect = { x: 0, y: 0, width: 1200, height: 800 };
const cards: RoamRect[] = [
  { x: 64, y: 140, width: 320, height: 280 },
  { x: 398, y: 140, width: 320, height: 280 },
  { x: 732, y: 140, width: 404, height: 600 },
];
const content: RoamRect = { x: 64, y: 140, width: 1072, height: 600 };
const spots = findRoamSpots({ frame, content, obstacles: cards, mascotSize: 44 });
const lookPoints = cards.map((card) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 }));
const openContext: RoamContext = {
  blocked: false,
  captureFailed: false,
  reducedMotion: false,
  frame,
  content,
  obstacles: cards,
  spots,
  lookPoints,
};

function overlaps(a: RoamRect, b: RoamRect, gap = 8) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function bodyAt(x: number, y: number, size = 44): RoamRect {
  const half = size / 2;
  return { x: x - half, y: y - half, width: size, height: size };
}

function runOuting(state: RoamState, startAt: number, ctx: RoamContext, random: () => number) {
  let current = roamTick(forceRoamStart(state, startAt), startAt, ctx, random);
  let now = startAt;
  const expressionChanges: { at: number; id: string }[] = [];
  let lastExpression = current.expression;
  let maxAwake = 0;

  for (let step = 0; step < 600 && current.away; step += 1) {
    now += 100;
    current = roamTick(current, now, ctx, random);
    if (current.away) maxAwake = Math.max(maxAwake, current.awakeSpentMs);
    if (current.away && current.expression !== lastExpression) {
      expressionChanges.push({ at: now - startAt, id: current.expression });
      lastExpression = current.expression;
    }
  }

  return { state: current, now, expressionChanges, maxAwake };
}

describe("roam safe spots", () => {
  test("keeps every candidate clear of cards and view edges", () => {
    expect(spots.length).toBeGreaterThan(6);
    for (const spot of spots) {
      const body = bodyAt(spot.point.x, spot.point.y);
      expect(body.x).toBeGreaterThanOrEqual(frame.x);
      expect(body.y).toBeGreaterThanOrEqual(frame.y);
      expect(body.x + body.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(body.y + body.height).toBeLessThanOrEqual(frame.y + frame.height);
      for (const card of cards) expect(overlaps(body, card)).toBe(false);
    }
  });

  test("derives the roaming lanes from the content bounds, not the panel padding", () => {
    const laneContent: RoamRect = { x: 200, y: 140, width: 800, height: 580 };
    const laneSpots = findRoamSpots({ frame, content: laneContent, obstacles: [], mascotSize: 44 });
    expect(laneSpots.some((spot) => spot.lane === "left" && spot.point.x < laneContent.x)).toBe(true);
    expect(laneSpots.some((spot) => spot.lane === "right" && spot.point.x > laneContent.x + laneContent.width)).toBe(true);
    expect(laneSpots.some((spot) => spot.lane === "floor" && spot.point.y > laneContent.y + laneContent.height)).toBe(true);
    for (const spot of laneSpots.filter((candidate) => candidate.lane === "left")) {
      expect(bodyAt(spot.point.x, spot.point.y).x + 44).toBeLessThanOrEqual(laneContent.x + 1);
    }
  });

  test("rejects a candidate whose rail is blocked", () => {
    const blockedRail = findRoamSpots({
      frame,
      content,
      obstacles: [...cards, { x: 0, y: 170, width: 70, height: 180 }],
      mascotSize: 44,
    });
    expect(blockedRail.some((spot) => spot.lane === "left" && spot.point.y > 170 && spot.point.y < 350)).toBe(false);
    expect(blockedRail.some((spot) => spot.lane === "right")).toBe(true);
    expect(blockedRail.some((spot) => spot.lane === "floor")).toBe(true);
  });

  test("returns no candidates when the frame is too small", () => {
    expect(findRoamSpots({
      frame: { x: 0, y: 0, width: 420, height: 500 },
      content: { x: 64, y: 128, width: 292, height: 300 },
      obstacles: [],
      mascotSize: 44,
    })).toEqual([]);
  });
});

describe("roam controller", () => {
  test("starts on elapsed time, not user input", () => {
    const random = () => 0.5;
    let state = createRoamState(0, random);
    state = roamTick(state, 0, openContext, random);
    expect(state.away).toBe(false);
    state = roamTick(state, 120_000, openContext, random);
    expect(state.away).toBe(false);
    state = roamTick(state, 140_000, openContext, random);
    expect(state.away).toBe(true);
  });

  test("pauses in place while UI is blocked and keeps the remaining budget", () => {
    const random = seededRoamRandom(9);
    let state = forceRoamStart(createRoamState(0, random), 0);
    state = roamTick(state, 0, openContext, random);
    state = roamTick(state, 200, openContext, random);
    const before = state;

    for (let now = 300; now <= 5_000; now += 100) {
      state = roamTick(state, now, { ...openContext, blocked: true }, random);
    }
    expect(state.away).toBe(true);
    expect(state.awakeSpentMs).toBe(before.awakeSpentMs);
    expect(state.phase).toBe(before.phase);

    state = roamTick(state, 5_100, openContext, random);
    expect(state.awakeSpentMs).toBeGreaterThan(before.awakeSpentMs);
  });

  test("capture failure and reduced motion both send the mascot home", () => {
    for (const ctx of [
      { ...openContext, captureFailed: true },
      { ...openContext, reducedMotion: true },
    ]) {
      const random = seededRoamRandom(4);
      let state = forceRoamStart(createRoamState(0, random), 0);
      state = roamTick(state, 0, openContext, random);
      state = roamTick(state, 200, openContext, random);
      expect(state.away).toBe(true);
      state = roamTick(state, 300, ctx, random);
      expect(state.away).toBe(false);
      expect(state.phase).toBe("resting");
    }
  });

  test("outings vary in length and expression, and never exceed the awake budget", () => {
    const counts = new Set<number>();
    const expressions = new Set<string>();
    let cursor = 0;

    for (let seed = 1; seed <= 40; seed += 1) {
      const random = seededRoamRandom(seed);
      const before = createRoamState(cursor, random);
      const result = runOuting(before, cursor, openContext, random);
      counts.add(result.state.stopCount - before.stopCount);
      for (const change of result.expressionChanges) expressions.add(change.id);
      expect(result.state.away).toBe(false);
      expect(result.maxAwake).toBeLessThanOrEqual(35_000);
      for (let index = 1; index < result.expressionChanges.length; index += 1) {
        expect(result.expressionChanges[index]!.at - result.expressionChanges[index - 1]!.at).toBeGreaterThanOrEqual(900);
      }
      cursor = result.now + 1_000;
    }

    expect(counts.size).toBeGreaterThan(3);
    expect(expressions.size).toBeGreaterThan(4);
  });

  test("a long random simulation always returns home and respects the cap", () => {
    const random = seededRoamRandom(77);
    let state = createRoamState(0, random);
    let now = 0;

    for (let step = 0; step < 12_000; step += 1) {
      now += 100;
      state = roamTick(state, now, openContext, random);
      if (state.away) expect(state.awakeSpentMs).toBeLessThanOrEqual(state.awakeBudgetMs);
      if (!state.away && state.stopCount > 0 && step % 900 === 0) {
        state = forceRoamStart(state, now);
      }
    }

    expect(state.phase === "resting" || state.away).toBe(true);
  });
});
