import { clamp, createRng, easings } from "./bot/math";

export interface RoamRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoamPoint {
  x: number;
  y: number;
}

type RoamLane = "left" | "right" | "floor";

export interface RoamSpot {
  point: RoamPoint;
  lane: RoamLane;
}

type RoamPhase = "resting" | "waking" | "travelling" | "observing" | "returning";
type RoamAction = "wait" | "waking" | "look" | "wander" | "cross" | "drift" | "home";
type RoamMood = "curious" | "suspicious" | "sleepy" | "neutral";

export interface RoamContext {
  /** Modal UI, readers, background work, and hidden windows pause the outing. */
  blocked: boolean;
  captureFailed: boolean;
  reducedMotion: boolean;
  frame: RoamRect;
  content: RoamRect;
  obstacles: readonly RoamRect[];
  spots: readonly RoamSpot[];
  lookPoints: readonly RoamPoint[];
}

interface RoamTravel {
  from: RoamPoint;
  to: RoamPoint;
  route: RoamPoint[];
  toSpot: RoamSpot | null;
  elapsedMs: number;
  durationMs: number;
}

export interface RoamState {
  phase: RoamPhase;
  action: RoamAction;
  away: boolean;
  expression: string;
  position: RoamPoint;
  spot: RoamSpot | null;
  lookPoint: RoamPoint | null;
  travel: RoamTravel | null;
  nextStartAt: number;
  awakeSpentMs: number;
  awakeBudgetMs: number;
  wakeUntilMs: number;
  holdUntilMs: number;
  lastNow: number;
  stopCount: number;
}

interface WeightedExpression {
  id: string;
  weight: number;
  mood: RoamMood;
}

const EXPRESSIONS: readonly WeightedExpression[] = [
  { id: "curieux", weight: 3, mood: "curious" },
  { id: "attentif", weight: 2, mood: "curious" },
  { id: "surpris", weight: 1, mood: "curious" },
  { id: "excite", weight: 1.2, mood: "curious" },
  { id: "hilare", weight: 0.8, mood: "curious" },
  { id: "heureux", weight: 1.4, mood: "neutral" },
  { id: "fier", weight: 1, mood: "neutral" },
  { id: "timide", weight: 1, mood: "neutral" },
  { id: "blase", weight: 1.4, mood: "suspicious" },
  { id: "mefiant", weight: 1, mood: "suspicious" },
  { id: "confus", weight: 0.9, mood: "suspicious" },
  { id: "effraye", weight: 0.5, mood: "suspicious" },
  { id: "somnolent", weight: 1.5, mood: "sleepy" },
];

const MAX_TICK_GAP_MS = 250;
const WANDER_MIN_DISTANCE = 32;
const CROSS_MIN_DISTANCE = 120;

const distance = (a: RoamPoint, b: RoamPoint) => Math.hypot(b.x - a.x, b.y - a.y);

const range = (random: () => number, min: number, max: number) => min + (max - min) * random();

function pickWeighted<T>(random: () => number, entries: readonly { value: T; weight: number }[]): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random() * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1]!.value;
}

function pickExpression(random: () => number, previous: string | null): string {
  const options = EXPRESSIONS.filter((expression) => expression.id !== previous);
  return pickWeighted(random, options.map((expression) => ({ value: expression, weight: expression.weight }))).id;
}

function moodForExpression(expression: string): RoamMood {
  return EXPRESSIONS.find((candidate) => candidate.id === expression)?.mood ?? "neutral";
}

function pickPoint(random: () => number, points: readonly RoamPoint[]): RoamPoint | null {
  if (points.length === 0) return null;
  return points[Math.min(points.length - 1, Math.floor(random() * points.length))]!;
}

function pickSpot(random: () => number, spots: readonly RoamSpot[]): RoamSpot | null {
  if (spots.length === 0) return null;
  return spots[Math.min(spots.length - 1, Math.floor(random() * spots.length))]!;
}

function rectsOverlap(a: RoamRect, b: RoamRect, gap = 0) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function bodyRect(point: RoamPoint, size: number, padding = 0): RoamRect {
  const half = size / 2;
  return {
    x: point.x - half - padding,
    y: point.y - half - padding,
    width: size + padding * 2,
    height: size + padding * 2,
  };
}

/**
 * Candidate spots are confined to the main content's outer rails and the empty
 * lane below the scroll area. A straight move between rails would cross cards,
 * so the controller travels through the floor lane instead.
 */
export function findRoamSpots({
  frame,
  content,
  obstacles,
  mascotSize,
  gap = 12,
}: {
  frame: RoamRect;
  content: RoamRect;
  obstacles: readonly RoamRect[];
  mascotSize: number;
  gap?: number;
}): RoamSpot[] {
  const half = mascotSize / 2;
  const leftX = content.x - half - gap - 2;
  const rightX = content.x + content.width + half + gap + 2;
  const floorY = content.y + content.height + half + gap;
  const railBottom = floorY - mascotSize - 12;
  const railTop = content.y + half + gap + 2;

  if (frame.width < mascotSize * 12 || frame.height < mascotSize * 10) return [];
  if (rightX - leftX < mascotSize * 1.5 || railBottom - railTop < mascotSize) return [];

  const candidates: RoamSpot[] = [];
  const accept = (point: RoamPoint, lane: RoamLane) => {
    const body = bodyRect(point, mascotSize);
    if (body.x < frame.x || body.y < frame.y || body.x + body.width > frame.x + frame.width) return;
    if (body.y + body.height > frame.y + frame.height) return;
    if (obstacles.some((obstacle) => rectsOverlap(body, obstacle, gap))) return;
    candidates.push({ point, lane });
  };

  for (let y = railTop, row = 0; y <= railBottom; y += 72, row += 1) {
    const offset = row % 2 === 0 ? 0 : 24;
    const railY = Math.min(railBottom, y + offset);
    accept({ x: leftX, y: railY }, "left");
    accept({ x: rightX, y: railY }, "right");
  }

  for (let x = leftX + 48; x <= rightX - 48; x += 76) {
    accept({ x, y: floorY }, "floor");
  }

  return candidates;
}

function returnSpot(spots: readonly RoamSpot[]): RoamSpot | null {
  const left = spots.filter((spot) => spot.lane === "left").sort((a, b) => a.point.y - b.point.y)[0];
  if (left) return left;
  const right = spots.filter((spot) => spot.lane === "right").sort((a, b) => a.point.y - b.point.y)[0];
  if (right) return right;
  return [...spots].sort((a, b) => a.point.x - b.point.x)[0] ?? null;
}

function routeBetween(from: RoamPoint, to: RoamPoint, fromSpot: RoamSpot | null, toSpot: RoamSpot, spots: readonly RoamSpot[]): RoamPoint[] {
  if (fromSpot?.lane === toSpot.lane) return [from, to];

  const floor = spots.find((spot) => spot.lane === "floor");
  const floorY = floor?.point.y;
  if (floorY === undefined) return [from, to];

  if (toSpot.lane === "floor") {
    return fromSpot?.lane === "left" || fromSpot?.lane === "right"
      ? [from, { x: from.x, y: floorY }, to]
      : [from, to];
  }

  if (fromSpot?.lane === "floor") {
    return [from, { x: to.x, y: from.y }, to];
  }

  if (fromSpot?.lane === "left" || fromSpot?.lane === "right") {
    return [from, { x: from.x, y: floorY }, { x: to.x, y: floorY }, to];
  }

  return [from, to];
}

function routeLength(route: readonly RoamPoint[]): number {
  let total = 0;
  for (let index = 1; index < route.length; index += 1) total += distance(route[index - 1]!, route[index]!);
  return total;
}

function positionOnRoute(route: readonly RoamPoint[], progress: number): RoamPoint {
  if (route.length === 0) return { x: 0, y: 0 };
  if (route.length === 1) return route[0]!;
  const eased = easings.easeInOutCubic(clamp(progress));
  let remaining = routeLength(route) * eased;
  for (let index = 1; index < route.length; index += 1) {
    const from = route[index - 1]!;
    const to = route[index]!;
    const length = distance(from, to);
    if (remaining <= length) {
      const t = length === 0 ? 1 : remaining / length;
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    }
    remaining -= length;
  }
  return route[route.length - 1]!;
}

export function createRoamState(now: number, random: () => number = Math.random): RoamState {
  return {
    phase: "resting",
    action: "wait",
    away: false,
    expression: "neutre",
    position: { x: 0, y: 0 },
    spot: null,
    lookPoint: null,
    travel: null,
    nextStartAt: now + range(random, 90_000, 180_000),
    awakeSpentMs: 0,
    awakeBudgetMs: 0,
    wakeUntilMs: 0,
    holdUntilMs: 0,
    lastNow: now,
    stopCount: 0,
  };
}

function restAtHome(state: RoamState, now: number, random: () => number): RoamState {
  return {
    ...state,
    phase: "resting",
    action: "wait",
    away: false,
    spot: null,
    lookPoint: null,
    travel: null,
    nextStartAt: now + range(random, 90_000, 180_000),
    awakeSpentMs: 0,
    awakeBudgetMs: 0,
    wakeUntilMs: 0,
    holdUntilMs: 0,
    lastNow: now,
  };
}

function startReturn(state: RoamState, now: number, ctx: RoamContext, random: () => number): RoamState {
  const gate = returnSpot(ctx.spots);
  if (!gate || !state.spot) return restAtHome(state, now, random);
  const route = routeBetween(state.position, gate.point, state.spot, gate, ctx.spots);
  const length = routeLength(route);
  return {
    ...state,
    phase: "returning",
    action: "home",
    travel: {
      from: state.position,
      to: gate.point,
      route,
      toSpot: gate,
      elapsedMs: 0,
      durationMs: clamp(700 + length * 0.9, 700, 1200),
    },
  };
}

function actionWeights(mood: RoamMood, remainingRatio: number) {
  const home = 0.25 + (1 - clamp(remainingRatio)) ** 2 * 6;
  switch (mood) {
    case "sleepy":
      return [
        { value: "look" as const, weight: 1.1 },
        { value: "wander" as const, weight: 0.8 },
        { value: "cross" as const, weight: 0.5 },
        { value: "drift" as const, weight: 3.4 },
        { value: "home" as const, weight: home + 0.8 },
      ];
    case "suspicious":
      return [
        { value: "look" as const, weight: 3.4 },
        { value: "wander" as const, weight: 3.1 },
        { value: "cross" as const, weight: 1.4 },
        { value: "drift" as const, weight: 0.9 },
        { value: "home" as const, weight: home },
      ];
    case "curious":
      return [
        { value: "look" as const, weight: 4.1 },
        { value: "wander" as const, weight: 2.1 },
        { value: "cross" as const, weight: 3.4 },
        { value: "drift" as const, weight: 1.1 },
        { value: "home" as const, weight: home * 0.55 },
      ];
    default:
      return [
        { value: "look" as const, weight: 3 },
        { value: "wander" as const, weight: 2.7 },
        { value: "cross" as const, weight: 2.2 },
        { value: "drift" as const, weight: 1.5 },
        { value: "home" as const, weight: home },
      ];
  }
}

function chooseAction(state: RoamState, random: () => number): RoamAction {
  const remaining = state.awakeBudgetMs > 0 ? 1 - state.awakeSpentMs / state.awakeBudgetMs : 0;
  return pickWeighted(random, actionWeights(moodForExpression(state.expression), remaining));
}

function chooseSpot(state: RoamState, action: RoamAction, spots: readonly RoamSpot[], random: () => number): RoamSpot | null {
  if (spots.length === 0) return null;
  const currentLane = state.spot?.lane;
  const candidates = spots.filter((spot) => {
    if (currentLane && spot.lane === currentLane) return distance(state.position, spot.point) >= WANDER_MIN_DISTANCE;
    return true;
  });
  const pool = candidates.length > 0 ? candidates : spots;

  if (action === "cross" && currentLane) {
    const far = pool.filter((spot) => spot.lane !== currentLane && distance(state.position, spot.point) >= CROSS_MIN_DISTANCE);
    if (far.length > 0) return pickSpot(random, far);
  }
  if (action === "drift") {
    const floor = pool.filter((spot) => spot.lane === "floor");
    if (floor.length > 0) return pickSpot(random, floor);
  }
  return pickSpot(random, pool);
}

function planTravel(state: RoamState, spot: RoamSpot, spots: readonly RoamSpot[]): RoamTravel {
  const route = routeBetween(state.position, spot.point, state.spot, spot, spots);
  const length = routeLength(route);
  return {
    from: state.position,
    to: spot.point,
    route,
    toSpot: spot,
    elapsedMs: 0,
    durationMs: clamp(600 + length * 1.15, 600, 2400),
  };
}

function beginOuting(state: RoamState, now: number, ctx: RoamContext, random: () => number): RoamState {
  const firstSpot = chooseSpot({ ...state, spot: null }, "cross", ctx.spots, random);
  if (!firstSpot) {
    return { ...state, nextStartAt: now + range(random, 15_000, 30_000), lastNow: now };
  }
  const expression = pickExpression(random, null);
  return {
    ...state,
    phase: "waking",
    action: "waking",
    away: true,
    expression,
    position: firstSpot.point,
    spot: firstSpot,
    awakeSpentMs: 0,
    awakeBudgetMs: range(random, 15_000, 35_000),
    wakeUntilMs: range(random, 450, 800),
    holdUntilMs: 0,
    travel: null,
    lookPoint: null,
    lastNow: now,
  };
}

function holdFor(action: RoamAction, random: () => number): number {
  if (action === "drift") return range(random, 3000, 5000);
  if (action === "cross") return range(random, 2000, 4000);
  return range(random, 1800, 3400);
}

function observe(state: RoamState, now: number, ctx: RoamContext, random: () => number, cameFrom: RoamAction): RoamState {
  return {
    ...state,
    phase: "observing",
    action: "look",
    expression: pickExpression(random, state.expression),
    position: state.travel?.to ?? state.position,
    spot: state.travel?.toSpot ?? state.spot,
    travel: null,
    lookPoint: pickPoint(random, ctx.lookPoints),
    holdUntilMs: state.awakeSpentMs + holdFor(cameFrom, random),
    stopCount: state.stopCount + 1,
    lastNow: now,
  };
}

function decideNext(state: RoamState, now: number, ctx: RoamContext, random: () => number): RoamState {
  if (state.awakeSpentMs >= state.awakeBudgetMs) return startReturn(state, now, ctx, random);
  const action = chooseAction(state, random);
  if (action === "home") return startReturn(state, now, ctx, random);
  if (action === "look") {
    return {
      ...state,
      phase: "observing",
      action: "look",
      expression: pickExpression(random, state.expression),
      lookPoint: pickPoint(random, ctx.lookPoints),
      holdUntilMs: state.awakeSpentMs + holdFor("look", random),
      stopCount: state.stopCount + 1,
      lastNow: now,
    };
  }
  const spot = chooseSpot(state, action, ctx.spots, random);
  if (!spot) return startReturn(state, now, ctx, random);
  return {
    ...state,
    phase: "travelling",
    action,
    travel: planTravel(state, spot, ctx.spots),
    lookPoint: null,
    lastNow: now,
  };
}

export function forceRoamStart(state: RoamState, now: number): RoamState {
  return { ...state, nextStartAt: now - 1, lastNow: now };
}

export function roamTick(state: RoamState, now: number, ctx: RoamContext, random: () => number = Math.random): RoamState {
  const rawDelta = now - state.lastNow;
  const delta = rawDelta >= 0 && rawDelta <= MAX_TICK_GAP_MS ? rawDelta : 0;
  const ticked = { ...state, lastNow: now };

  if (ctx.reducedMotion || ctx.captureFailed) {
    return state.away || state.phase !== "resting" ? restAtHome(state, now, random) : ticked;
  }

  if (!state.away) {
    if (now < state.nextStartAt) return ticked;
    if (ctx.blocked || ctx.spots.length < 2) {
      return { ...ticked, nextStartAt: now + range(random, 15_000, 30_000) };
    }
    return beginOuting(state, now, ctx, random);
  }

  if (ctx.blocked) return ticked;

  if (state.phase === "returning") {
    if (!state.travel) return restAtHome(state, now, random);
    const elapsedMs = state.travel.elapsedMs + delta;
    if (elapsedMs < state.travel.durationMs) {
      return { ...ticked, travel: { ...state.travel, elapsedMs } };
    }
    return restAtHome({ ...state, position: state.travel.to }, now, random);
  }

  const awakeSpentMs = state.awakeBudgetMs > 0
    ? Math.min(state.awakeSpentMs + delta, state.awakeBudgetMs)
    : state.awakeSpentMs + delta;
  const awake = { ...ticked, awakeSpentMs };

  if (state.phase === "waking") {
    if (awakeSpentMs < state.wakeUntilMs) return awake;
    return decideNext(awake, now, ctx, random);
  }

  if (state.phase === "travelling") {
    if (!state.travel) return decideNext(awake, now, ctx, random);
    const elapsedMs = state.travel.elapsedMs + delta;
    if (elapsedMs < state.travel.durationMs) {
      return { ...awake, travel: { ...state.travel, elapsedMs } };
    }
    return observe({ ...awake, travel: { ...state.travel, elapsedMs } }, now, ctx, random, state.action);
  }

  if (awakeSpentMs >= state.awakeBudgetMs) return startReturn(awake, now, ctx, random);
  if (awakeSpentMs < state.holdUntilMs) return awake;
  return decideNext(awake, now, ctx, random);
}

export function roamPosition(state: RoamState): RoamPoint {
  if (!state.travel) return state.position;
  return positionOnRoute(state.travel.route, state.travel.elapsedMs / state.travel.durationMs);
}

export function nearestRoamSpot(point: RoamPoint, spots: readonly RoamSpot[]): RoamSpot | null {
  let nearest: RoamSpot | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const spot of spots) {
    const d = distance(point, spot.point);
    if (d < best) {
      best = d;
      nearest = spot;
    }
  }
  return nearest;
}

export function isRoamPositionSafe(state: RoamState, ctx: RoamContext, mascotSize = 44): boolean {
  const body = bodyRect(roamPosition(state), mascotSize);
  if (
    body.x < ctx.frame.x ||
    body.y < ctx.frame.y ||
    body.x + body.width > ctx.frame.x + ctx.frame.width ||
    body.y + body.height > ctx.frame.y + ctx.frame.height
  ) return false;
  if (rectsOverlap(body, ctx.content)) return false;
  return !ctx.obstacles.some((obstacle) => rectsOverlap(body, obstacle));
}

function roamTravelProgress(state: RoamState): number {
  if (!state.travel) return 0;
  return clamp(state.travel.elapsedMs / state.travel.durationMs);
}

export function roamOpacity(state: RoamState): number {
  if (state.phase === "waking") {
    const progress = state.wakeUntilMs > 0 ? clamp(state.awakeSpentMs / state.wakeUntilMs) : 1;
    return 0.2 + progress * 0.8;
  }
  if (state.phase !== "returning" || !state.travel) return 1;
  const progress = roamTravelProgress(state);
  if (progress < 0.68) return 1;
  return 1 - clamp((progress - 0.68) / 0.32);
}

export function seededRoamRandom(seed: number): () => number {
  return createRng(seed);
}
