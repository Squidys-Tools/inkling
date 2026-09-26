/**
 * Wandering decisions for the mascot, with no DOM and no clock of its own.
 *
 * The whole behaviour lives here: when an outing starts, which of the five
 * actions comes next, how long it lasts, and which face it wears. Everything is
 * a pure function of (state, signals, random), so the decision space can be
 * tested with a fake clock and a seeded generator, and the dev board can run the
 * same code fast.
 *
 * Two rules shape the code:
 *
 * - Nothing is a fixed sequence. Stop count and route length fall out of the
 *   mood, the awake-time budget, and the dice. The tests assert variation rather
 *   than a shape.
 * - User input is not an interruption. Activity only picks what the mascot looks
 *   at; an overlay pauses the clock. The one thing that ends an outing early is a
 *   capture failure, because a failed save is a real mood.
 */

export type Rand = () => number;

type RoamMood = "curieux" | "attentif" | "blase" | "mefiant" | "somnolent";

/** The five wandering actions, plus the moment the mascot is back in its slot. */
export type RoamActionKind = "look" | "wander" | "cross" | "drift" | "go-home" | "arrive";

/** The four that keep an outing going. */
type RoamMove = Exclude<RoamActionKind, "go-home" | "arrive">;

/** What the action wants the caller to aim at. Resolution lives outside this file. */
export type RoamTarget = "item" | "activity" | "near" | "across" | "margin" | "home";

export interface RoamAction {
  kind: RoamActionKind;
  target: RoamTarget;
  /** ms until the mascot decides again */
  duration: number;
  /** ms the move itself takes; 0 while the mascot holds its place */
  travel: number;
  /** face held for the whole step */
  expression: string;
}

export interface RoamSignals {
  /** ms on the app's own timeline (see `onMascotClock`) */
  now: number;
  /** last deliberate user input, or -Infinity when the user has never touched anything */
  lastActivityAt: number;
  /** an overlay, dialog, menu, or reader owns the screen */
  occupied: boolean;
  reducedMotion: boolean;
  hidden: boolean;
  /** a capture failed: the outing ends and the mascot goes home sad */
  captureFailed: boolean;
  /** the library has somewhere safe to stand */
  canRoam: boolean;
  /** decide now, ignoring the scheduled time (dev board, and the start of an outing) */
  force?: boolean;
}

export interface RoamState {
  phase: "home" | "away" | "returning";
  /** ms when the next decision is due */
  due: number;
  /** awake time banked so far this outing */
  awakeMs: number;
  /** awake time this outing is allowed to spend */
  budgetMs: number;
  /** steps taken this outing, anything but the walk home */
  stops: number;
  outings: number;
  mood: RoamMood;
  expression: string;
  expressionAt: number;
  lastKind: RoamActionKind | null;
  /** last tick, so a pause can be measured instead of guessed */
  at: number;
}

export interface RoamTick {
  state: RoamState;
  /** the step to perform and render, or null while nothing is due */
  action: RoamAction | null;
}

/** First outing, and every outing after it, waits out a long cooldown. */
export const START_DELAY_MS = { min: 90_000, max: 180_000 } as const;
export const COOLDOWN_MS = { min: 90_000, max: 180_000 } as const;
export const AWAKE_MS = { min: 15_000, max: 35_000 } as const;

/**
 * Shortest gap between two face changes. The engine blends over 450ms, so a
 * faster swap reads as a flicker instead of a mood.
 */
export const MIN_EXPRESSION_HOLD_MS = 1_400;

/** How long a look counts as "the user is doing something worth watching". */
const ACTIVITY_WINDOW_MS = 4_000;

/** Below this much awake time left, the walk home is all that fits. */
const MIN_AWAKE_TO_STAY_MS = 500;

const MOVE_MS = { short: { min: 700, max: 1_500 }, long: { min: 1_500, max: 2_400 } } as const;
const DRIFT_TRAVEL_MS = { min: 1_000, max: 1_700 } as const;
const DRIFT_LINGER_MS = { min: 1_400, max: 3_000 } as const;
const LOOK_HOLD_MS = { min: 1_200, max: 2_800 } as const;
const HOME_MS = { min: 700, max: 1_200 } as const;

const MOVES: RoamMove[] = ["look", "wander", "cross", "drift"];

/** Base appetite per mood. Tiredness tilts the same table rather than replacing it. */
const WEIGHTS: Record<RoamMood, Record<RoamMove | "go-home", number>> = {
  curieux: { look: 34, wander: 22, cross: 26, drift: 12, "go-home": 4 },
  attentif: { look: 40, wander: 26, cross: 14, drift: 12, "go-home": 4 },
  blase: { look: 16, wander: 20, cross: 10, drift: 30, "go-home": 14 },
  mefiant: { look: 36, wander: 34, cross: 10, drift: 10, "go-home": 8 },
  somnolent: { look: 12, wander: 10, cross: 4, drift: 40, "go-home": 28 },
};

/**
 * The vocabulary. `neutre` is the face at home and `triste` is reserved for a
 * failed capture, so neither is in the pool.
 */
const EXPRESSION_POOL = [
  "curieux",
  "attentif",
  "heureux",
  "fier",
  "timide",
  "blase",
  "mefiant",
  "somnolent",
  "surpris",
  "excite",
  "hilare",
  "confus",
  "effraye",
] as const;

/** Faces a mood reaches for. Everything else in the pool keeps weight 1. */
const MOOD_LEANS: Record<RoamMood, ReadonlyArray<readonly [string, number]>> = {
  curieux: [
    ["curieux", 5],
    ["attentif", 3],
    ["confus", 3],
    ["surpris", 2],
    ["fier", 1],
  ],
  attentif: [
    ["attentif", 5],
    ["curieux", 3],
    ["surpris", 2],
    ["timide", 1],
  ],
  blase: [
    ["blase", 5],
    ["somnolent", 3],
    ["heureux", 1],
    ["timide", 1],
  ],
  mefiant: [
    ["mefiant", 5],
    ["blase", 3],
    ["confus", 2],
    ["curieux", 1],
  ],
  somnolent: [
    ["somnolent", 6],
    ["blase", 2],
    ["heureux", 1],
  ],
};

const MOODS = Object.keys(WEIGHTS) as RoamMood[];

function between(rand: Rand, span: { min: number; max: number }): number {
  return span.min + rand() * (span.max - span.min);
}

function pickWeighted<T>(rand: Rand, entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
}

function pickMood(rand: Rand, tiredness: number): RoamMood {
  // Tiredness does not replace the mood, it leans on it: a sleepy mascot that
  // was curious keeps some curiosity, it just stops crossing the library.
  const weights = MOODS.map((mood) => {
    const base = WEIGHTS[mood].drift + WEIGHTS[mood].look / 4;
    return [mood, base * (1 + (mood === "somnolent" ? 6 * tiredness : -1.2 * tiredness))] as const;
  }).filter(([, weight]) => weight > 0);
  return pickWeighted(rand, weights.length > 0 ? weights : MOODS.map((mood) => [mood, 1] as const));
}

function pickExpression(rand: Rand, mood: RoamMood, previous: string): string {
  const leans = new Map(MOOD_LEANS[mood].map(([id, weight]) => [id, weight]));
  const entries = EXPRESSION_POOL.filter((id) => id !== previous).map(
    (id) => [id, leans.get(id) ?? 1] as const,
  );
  return pickWeighted(rand, entries);
}

function pickActionKind(rand: Rand, mood: RoamMood, tiredness: number): RoamMove | "go-home" {
  // Walking somewhere costs attention; staring and drifting cost less. So a
  // tired mascot drifts and heads home, and a fresh one crosses the library.
  const base = WEIGHTS[mood];
  const weight = (kind: RoamMove | "go-home") => {
    if (kind === "go-home") return base["go-home"] * (1 + 3.5 * tiredness);
    const moving = kind === "wander" || kind === "cross";
    return base[kind] * (moving ? 1 - 0.7 * tiredness : 1 + 0.9 * tiredness);
  };
  return pickWeighted(rand, [...MOVES, "go-home" as const].map((kind) => [kind, weight(kind)] as const));
}

function homeAction(rand: Rand, expression: string): RoamAction {
  const travel = Math.round(between(rand, HOME_MS));
  return { kind: "go-home", target: "home", duration: travel, travel, expression };
}

export function createRoamState(now: number, rand: Rand): RoamState {
  return {
    phase: "home",
    due: now + Math.round(between(rand, START_DELAY_MS)),
    awakeMs: 0,
    budgetMs: 0,
    stops: 0,
    outings: 0,
    mood: pickMood(rand, 0),
    expression: "neutre",
    expressionAt: now,
    lastKind: null,
    at: now,
  };
}

/** Awake time left in this outing, in ms. */
export function awakeLeft(state: RoamState): number {
  return Math.max(0, state.budgetMs - state.awakeMs);
}

/** End the outing: a walk home of 700 to 1200ms, then the slot is occupied again. */
function leavingHome(next: RoamState, expression: string, mood: RoamMood, rand: Rand): RoamTick {
  const action = homeAction(rand, expression);
  return {
    state: {
      ...next,
      phase: "returning",
      mood,
      lastKind: "go-home",
      expression,
      expressionAt: next.at,
      due: next.at + action.duration,
    },
    action,
  };
}

/**
 * Advance the controller to `signals.now` and return the step to perform.
 *
 * Pausing is expressed by pushing `due` forward, so an overlay that stays open
 * for a minute neither burns awake time nor restarts the step that was running.
 */
export function tickRoam(state: RoamState, signals: RoamSignals, rand: Rand): RoamTick {
  const now = signals.now;
  const elapsed = Math.max(0, now - state.at);
  const paused = signals.occupied || signals.hidden;
  // Awake time is time spent in the library deciding things. The walk home and
  // the time behind a dialog are not part of the budget.
  const awake = state.phase === "away" && !paused;
  const next: RoamState = {
    ...state,
    at: now,
    due: paused ? state.due + elapsed : state.due,
    awakeMs: awake ? Math.min(state.budgetMs, state.awakeMs + elapsed) : state.awakeMs,
  };

  if (paused) return { state: next, action: null };

  // A walk already under way always finishes, so the hand-off back to the
  // sidebar still happens.
  if (state.phase === "returning") {
    if (now < next.due && !signals.force) return { state: next, action: null };
    return {
      state: {
        ...next,
        phase: "home",
        outings: state.outings + 1,
        stops: 0,
        due: now + Math.round(between(rand, COOLDOWN_MS)),
        expression: "neutre",
        expressionAt: now,
        lastKind: null,
      },
      action: { kind: "arrive", target: "home", duration: 0, travel: 0, expression: "neutre" },
    };
  }

  // Reduced motion never leaves home. An outing already under way ends without
  // drama: the sidebar keeps its sway and the day goes on.
  if (signals.reducedMotion) {
    if (state.phase === "home") return { state: next, action: null };
    return leavingHome(next, next.expression, next.mood, rand);
  }

  if (state.phase === "home") {
    // Nowhere to stand: stay home and try again on the next due time.
    if (!signals.canRoam) return { state: next, action: null };
    if (now < next.due && !signals.force) return { state: next, action: null };
    return step(
      { ...next, phase: "away", awakeMs: 0, stops: 0, budgetMs: Math.round(between(rand, AWAKE_MS)) },
      signals,
      rand,
      true,
    );
  }

  if (now < next.due && !signals.force) return { state: next, action: null };
  return step(next, signals, rand, false);
}

/** One decision: pick a mood, pick an action, size it to the awake time left. */
function step(next: RoamState, signals: RoamSignals, rand: Rand, departing: boolean): RoamTick {
  const now = next.at;
  const left = awakeLeft(next);

  // A failed capture is the one thing that ends an outing early, and the mascot
  // is sad about it on the way home.
  if (signals.captureFailed) return leavingHome(next, "triste", next.mood, rand);

  if (left <= MIN_AWAKE_TO_STAY_MS) return leavingHome(next, next.expression, next.mood, rand);

  const tiredness = next.budgetMs > 0 ? 1 - left / next.budgetMs : 0;
  const mood = pickMood(rand, tiredness);
  let kind = pickActionKind(rand, mood, tiredness);

  // The first step out of the slot is always a move: a glance made from behind
  // the sidebar is not leaving, and neither is turning straight back round.
  if (departing && (kind === "look" || kind === "go-home")) kind = "wander";

  // Nowhere to stand means the walk is over. The mascot goes home rather than
  // parking somewhere it would sit on top of a card.
  if (!signals.canRoam) return leavingHome(next, next.expression, mood, rand);
  if (kind === "go-home") return leavingHome(next, next.expression, mood, rand);

  const recent = now - signals.lastActivityAt <= ACTIVITY_WINDOW_MS;
  const target: RoamTarget =
    kind === "look" ? (recent ? "activity" : "item") : kind === "wander" ? "near" : kind === "cross" ? "across" : "margin";
  const travel =
    kind === "look" ? 0 : Math.round(between(rand, kind === "cross" ? MOVE_MS.long : kind === "drift" ? DRIFT_TRAVEL_MS : MOVE_MS.short));
  const linger = kind === "drift" ? Math.round(between(rand, DRIFT_LINGER_MS)) : 0;
  const duration = Math.min(travel + linger + (kind === "look" ? Math.round(between(rand, LOOK_HOLD_MS)) : 0), left);

  // The face holds long enough to read as a mood, then may change. Random, but
  // never twice in a blink.
  const expression =
    now - next.expressionAt >= MIN_EXPRESSION_HOLD_MS ? pickExpression(rand, mood, next.expression) : next.expression;

  return {
    state: {
      ...next,
      mood,
      stops: next.stops + 1,
      expression,
      expressionAt: expression === next.expression ? next.expressionAt : now,
      lastKind: kind,
      due: now + Math.max(duration, 300),
    },
    action: { kind, target, duration: Math.max(duration, 300), travel: Math.min(travel, Math.max(duration, 300)), expression },
  };
}

/**
 * Deterministic generator for tests and the dev board. Production passes
 * `Math.random`, so nothing in the app depends on a seed.
 */
export function createSeededRandom(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
