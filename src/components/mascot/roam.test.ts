import { describe, expect, test } from "bun:test";
import {
  AWAKE_MS,
  COOLDOWN_MS,
  MIN_EXPRESSION_HOLD_MS,
  START_DELAY_MS,
  createRoamState,
  createSeededRandom,
  tickRoam,
  type RoamAction,
  type RoamActionKind,
  type RoamSignals,
  type RoamState,
} from "./roam";

/** The clock the tests walk. Fine enough to land inside any decision window. */
const STEP = 100;

interface Step {
  at: number;
  action: RoamAction;
  state: RoamState;
}

interface Simulation {
  state: RoamState;
  steps: Step[];
}

/** The app's steady state: idle user, nothing modal, a library with room. */
const IDLE = (): Partial<RoamSignals> => ({});

function simulate(
  seed: number,
  signals: (now: number) => Partial<RoamSignals> = IDLE,
  until = 25 * 60_000,
): Simulation {
  const rand = createSeededRandom(seed);
  let state = createRoamState(0, rand);
  const steps: Step[] = [];
  for (let now = STEP; now <= until; now += STEP) {
    const tick = tickRoam(
      state,
      {
        now,
        lastActivityAt: -Infinity,
        occupied: false,
        reducedMotion: false,
        hidden: false,
        captureFailed: false,
        canRoam: true,
        ...signals(now),
      },
      rand,
    );
    state = tick.state;
    if (tick.action) steps.push({ at: now, action: tick.action, state });
  }
  return { state, steps };
}

/** Outings are the stretch between leaving the slot and being back in it. */
function outings(steps: Step[]): Array<Step[]> {
  const found: Array<Step[]> = [];
  let current: Step[] | null = null;
  for (const step of steps) {
    if (step.action.kind === "arrive") {
      if (current) found.push(current);
      current = null;
      continue;
    }
    if (!current) current = [];
    current.push(step);
  }
  return found;
}

/**
 * Run a seed with a signal window anchored to the start of its first outing.
 * The first outing lands somewhere between 90 and 180 seconds, so a fixed
 * window would mostly miss it; the seed makes two passes agree.
 */
function fromFirstOuting(
  seed: number,
  window: (start: number) => (now: number) => Partial<RoamSignals>,
): Simulation {
  return simulate(seed, window(simulate(seed).steps[0]!.at));
}

describe("roaming controller", () => {
  test("the first outing starts 90 to 180 seconds in, whatever the user is doing", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const idle = simulate(seed);
      const busy = simulate(seed, (now) => ({ lastActivityAt: now }));
      expect(idle.steps.length).toBeGreaterThan(0);
      expect(busy.steps.length).toBeGreaterThan(0);
      // Typing, clicking and scrolling never move the clock.
      expect(busy.steps[0]!.at).toBe(idle.steps[0]!.at);
      expect(idle.steps[0]!.at).toBeGreaterThanOrEqual(START_DELAY_MS.min);
      expect(idle.steps[0]!.at).toBeLessThanOrEqual(START_DELAY_MS.max);
    }
  });

  test("the first step out of the slot is a move, never a glance", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const first = simulate(seed).steps[0]!;
      expect(["wander", "cross", "drift"]).toContain(first.action.kind);
    }
  });

  test("walking home takes 700 to 1200ms and the next outing waits out the cooldown", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { steps } = simulate(seed);
      for (let i = 0; i < steps.length - 1; i++) {
        const step = steps[i]!;
        if (step.action.kind !== "go-home") continue;
        const arrive = steps[i + 1]!;
        expect(arrive.action.kind).toBe("arrive");
        expect(arrive.at - step.at).toBeGreaterThanOrEqual(700);
        expect(arrive.at - step.at).toBeLessThanOrEqual(1_200);
      }
      // Cooldown is measured from being back, not from the walk home.
      const back = steps.filter((step) => step.action.kind === "arrive").map((step) => step.at);
      const later = steps.filter((step) => step.action.kind !== "arrive").map((step) => step.at);
      for (const at of later) {
        const since = back.filter((done) => at - done >= 0).pop();
        if (since === undefined) continue;
        expect(at - since).toBeGreaterThanOrEqual(COOLDOWN_MS.min);
      }
    }
  });

  test("an outing never outstays its awake time", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const outing of outings(simulate(seed).steps)) {
        const start = outing[0]!;
        const back = outing[outing.length - 1]!;
        const budget = start.state.budgetMs;
        expect(budget).toBeGreaterThanOrEqual(AWAKE_MS.min);
        expect(budget).toBeLessThanOrEqual(AWAKE_MS.max);
        // The walk itself is not awake time; the pause in the library is.
        expect(back.state.awakeMs).toBeLessThanOrEqual(budget);
        const lastLook = [...outing].reverse().find((step) => step.action.kind !== "go-home")!;
        expect(lastLook.at - start.at).toBeLessThanOrEqual(budget);
      }
    }
  });

  test("every action in the model turns up, and no two outings are the same shape", () => {
    const kinds = new Set<RoamActionKind>();
    const stopCounts = new Set<number>();
    const expressions = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      for (const outing of outings(simulate(seed).steps)) {
        stopCounts.add(outing.length - 1);
        for (const step of outing) {
          kinds.add(step.action.kind);
          expressions.add(step.action.expression);
        }
      }
    }
    expect([...kinds].sort()).toEqual(["cross", "drift", "go-home", "look", "wander"]);
    expect(Math.min(...stopCounts)).toBeLessThanOrEqual(3);
    expect(Math.max(...stopCounts)).toBeGreaterThan(8);
    expect(stopCounts.size).toBeGreaterThan(4);
    // A big enough vocabulary that outings do not read as the same face.
    expect(expressions.size).toBeGreaterThan(8);
  });

  test("a face is never swapped twice in a blink", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let held: string | null = null;
      let since = 0;
      for (const step of simulate(seed).steps) {
        if (step.action.expression === held) continue;
        expect(step.at - since).toBeGreaterThanOrEqual(MIN_EXPRESSION_HOLD_MS);
        held = step.action.expression;
        since = step.at;
      }
    }
  });

  test("an overlay holds the walk still without spending the awake time", () => {
    const { steps } = fromFirstOuting(7, (start) => (now) => ({
      occupied: now >= start + 3_000 && now < start + 20_000,
    }));
    const during = steps.filter((step) => step.at > 3_000 && step.at < 20_000);
    // Nothing is decided while the dialog owns the screen.
    expect(during.every((step) => step.at <= 3_000)).toBe(true);
    const back = steps.find((step) => step.action.kind === "arrive")!;
    expect(back.at).toBeGreaterThan(20_000);
    // The walk home still lands, and the dialog did not eat the budget.
    expect(back.state.awakeMs).toBeLessThanOrEqual(back.state.budgetMs);
    expect(back.state.outings).toBeGreaterThanOrEqual(1);
  });

  test("input keeps the outing alive and it still goes home on its own", () => {
    const { steps } = simulate(11, (now) => ({ lastActivityAt: now }));
    const found = outings(steps);
    expect(found.length).toBeGreaterThan(0);
    // A user working in the library is something to watch, not a reason to leave.
    expect(found.some((outing) => outing.some((step) => step.action.target === "activity"))).toBe(true);
    for (const outing of found) expect(outing[outing.length - 1]!.action.kind).toBe("go-home");
  });

  test("a failed capture ends the outing and the mascot is sad on the way home", () => {
    const { steps } = fromFirstOuting(3, (start) => (now) => ({
      captureFailed: now >= start + 2_000 && now < start + 12_000,
    }));
    const sad = steps.filter((step) => step.action.kind === "go-home" && step.action.expression === "triste");
    expect(sad.length).toBe(1);
    expect(sad[0]!.at).toBeGreaterThanOrEqual(2_000);
    const back = steps.find((step) => step.action.kind === "arrive")!;
    expect(back.at).toBeGreaterThanOrEqual(sad[0]!.at);
  });

  test("reduced motion never leaves home", () => {
    const { steps, state } = simulate(5, () => ({ reducedMotion: true }));
    expect(steps).toHaveLength(0);
    expect(state.phase).toBe("home");
  });

  test("reduced motion mid-outing ends the walk without a scene", () => {
    const { steps } = fromFirstOuting(9, (start) => (now) => ({ reducedMotion: now >= start + 4_000 }));
    const back = steps.find((step) => step.action.kind === "go-home")!;
    expect(back.at).toBeGreaterThanOrEqual(4_000);
    expect(back.action.expression).not.toBe("triste");
    expect(steps.some((step) => step.action.kind === "arrive")).toBe(true);
  });

  test("a library with no room keeps the mascot home, mid-outing too", () => {
    const blocked = simulate(13, () => ({ canRoam: false }));
    expect(blocked.steps).toHaveLength(0);
    expect(blocked.state.phase).toBe("home");

    const lost = fromFirstOuting(13, (start) => (now) => ({ canRoam: now < start + 5_000 }));
    const home = lost.steps.find((step) => step.action.kind === "go-home")!;
    expect(home.at).toBeGreaterThanOrEqual(5_000);
    expect(lost.steps.some((step) => step.action.kind === "arrive")).toBe(true);
  });

  test("a hidden tab freezes the walk the same way an overlay does", () => {
    const { steps } = fromFirstOuting(17, (start) => (now) => ({
      hidden: now >= start + 2_000 && now < start + 15_000,
    }));
    // Nothing is decided while the tab is in the background, and the walk
    // continues once it is back.
    expect(steps.filter((step) => step.at > 2_000 && step.at < 15_000)).toHaveLength(0);
    expect(steps.some((step) => step.action.kind === "arrive")).toBe(true);
  });

  test("forcing an outing skips the wait without changing the rest", () => {
    const rand = createSeededRandom(21);
    let state = createRoamState(0, rand);
    const first = tickRoam(state, {
      now: 1_000,
      lastActivityAt: -Infinity,
      occupied: false,
      reducedMotion: false,
      hidden: false,
      captureFailed: false,
      canRoam: true,
      force: true,
    }, rand);
    expect(first.action).not.toBeNull();
    state = first.state;
    expect(state.phase).toBe("away");
    expect(state.awakeMs).toBeLessThanOrEqual(state.budgetMs);
  });
});
