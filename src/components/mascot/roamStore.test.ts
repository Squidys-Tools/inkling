import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getRoamState,
  roamMotion,
  setRoamBody,
  setRoamCaptureFailed,
  setRoamManual,
  setRoamNode,
  setRoamSeed,
  setRoamSpeed,
  stepRoam,
  watchRoamInputs,
} from "./roamStore";

// The store is a module singleton written for a real browser, so these tests
// fake the few globals it reads and put them back afterwards: a stubbed document
// or requestAnimationFrame left behind would reach every later test file.
// Bun exposes some of these as readonly accessors, so they are defined and
// restored by descriptor rather than assigned.
const STUBBED = ["document", "window", "requestAnimationFrame", "cancelAnimationFrame"] as const;

const rect = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
});

function stubElement(box: ReturnType<typeof rect>) {
  return {
    getBoundingClientRect: () => box,
    querySelectorAll: () => [],
    style: {},
  } as unknown as Element;
}

function define(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}

let rafCb: FrameRequestCallback | null = null;
let clock = 0;
let saved: Array<[string, PropertyDescriptor | undefined]> = [];
let stopWatching: (() => void) | null = null;
let motionHandlers: Array<(event: { matches: boolean }) => void> = [];

/** One frame of the store's own clock, driven by hand. */
function frame(ms: number) {
  clock += ms;
  rafCb?.(clock);
}

/** No `.library-grid`, which is the open-ground case: an empty library. */
function stubBrowser() {
  const shell = stubElement(rect(0, 0, 1600, 900));
  const mark = stubElement(rect(80, 40, 120, 80));
  define("document", {
    hidden: false,
    querySelector: (selector: string) =>
      selector === ".app-shell" ? shell : selector === ".brand-mark" ? mark : null,
    addEventListener: () => {},
  });
  motionHandlers = [];
  define("window", {
    innerWidth: 1600,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({
      matches: false,
      addEventListener: (_type: string, fn: (event: { matches: boolean }) => void) => motionHandlers.push(fn),
      removeEventListener: () => {},
    }),
  });
  define("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCb = cb;
    return 1;
  });
  define("cancelAnimationFrame", () => {});
}

/**
 * Back to the sidebar slot, so every test starts from the same place whatever
 * the one before it left behind. Awake time is spent against the store's own
 * clock, so the clock is what has to move: a fast multiplier and a long frame
 * each, bounded by the loop rather than by a sleep.
 */
async function goHome() {
  setRoamSpeed(600);
  for (let i = 0; i < 500 && getRoamState()?.phase !== "home"; i++) {
    frame(1000);
    stepRoam();
  }
  setRoamSpeed(1);
  // The hop out of the slot finishes on a real timer. Left pending, it lands
  // in the middle of the next test and zeroes the motion it is measuring, so
  // wait for the departure to actually finish rather than for a fixed delay.
  return until(settled);
}

/** An outing has ended: finishOuting parks the motion back at the slot. */
function settled() {
  const { x, y } = roamMotion();
  return x === 0 && y === 0;
}

/** Resolve when `done` is true, or give up rather than hang the suite. */
function until(done: () => boolean, tries = 100): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => {
      if (done() || left === 0) resolve();
      else setTimeout(() => tick(left - 1), 10);
    };
    tick(tries);
  });
}

beforeEach(async () => {
  saved = STUBBED.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  rafCb = null;
  clock = 0;
  stubBrowser();
  // The teardown matters: each watch registers another clock handler, and two
  // of them on one frame cancels the interval these tests are measuring.
  stopWatching = watchRoamInputs();
  setRoamSeed(3);
  await goHome();
});

afterEach(() => {
  stopWatching?.();
  stopWatching = null;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  saved = [];
});

describe("roam store", () => {
  test("a capture failed while home is spent leaving, not carried into the outing", () => {
    setRoamCaptureFailed(true);
    stepRoam();
    expect(getRoamState()?.phase).toBe("away");
    // The first decision of the new outing must not be a sad walk home.
    stepRoam();
    expect(getRoamState()?.expression).not.toBe("triste");
  });

  test("the drift step follows the real interval between frames, clamped on stalls", () => {
    stepRoam();
    expect(getRoamState()?.phase).toBe("away");
    // Let the pace ease in before measuring anything.
    for (let i = 0; i < 90; i++) frame(16);

    const a = roamMotion();
    for (let i = 0; i < 30; i++) frame(16);
    const b = roamMotion();
    const small = Math.hypot(b.x - a.x, b.y - a.y);

    for (let i = 0; i < 30; i++) frame(100);
    const c = roamMotion();
    const large = Math.hypot(c.x - b.x, c.y - b.y);

    // A stalled frame must not buy a second of travel: the step is clamped at
    // 0.05s, which is the same cap a 100ms frame already hits.
    for (let i = 0; i < 30; i++) frame(1000);
    const d = roamMotion();
    const stall = Math.hypot(d.x - c.x, d.y - c.y);

    expect(large).toBeGreaterThan(small * 1.5);
    expect(stall).toBeLessThanOrEqual(large * 1.5);
  });

  test("going home hops out where it stands, rather than walking a return it cannot finish", async () => {
    stepRoam();
    expect(getRoamState()?.phase).toBe("away");
    // Drift well clear of the slot, so a timed return could not reach it.
    for (let i = 0; i < 200; i++) frame(16);
    const before = roamMotion();

    // Run the controller forward until it decides to go home. Going home is a
    // weighted choice, so it is driven to rather than assumed.
    for (let i = 0; i < 400 && getRoamState()?.phase !== "returning"; i++) {
      frame(16);
      stepRoam();
    }
    expect(getRoamState()?.phase).toBe("returning");
    const after = roamMotion();
    // The point of the hop: it must not set off toward the slot and travel.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(
      Math.hypot(before.x, before.y) * 0.5,
    );
    // And it must actually leave, without waiting out the return schedule.
    await until(settled);
    expect(settled()).toBe(true);
  });

  test("a squash requested before the overlay mounted lands once the node registers, even stepping by hand", () => {
    setRoamManual(true);
    stepRoam();
    expect(getRoamState()?.phase).toBe("away");
    // No body yet: the grow-in write had nothing to land on.
    const bodyEl = { style: {} as { transform?: string } };
    setRoamBody(bodyEl as unknown as HTMLDivElement);
    setRoamNode({ style: {} } as unknown as HTMLDivElement);
    frame(16);
    expect(bodyEl.style.transform).toBe("scale(1)");
    setRoamManual(false);
    setRoamNode(null);
    setRoamBody(null);
  });

  test("turning reduced motion on ends a live outing without another frame", () => {
    stepRoam();
    expect(getRoamState()?.phase).toBe("away");
    for (const handler of motionHandlers) handler({ matches: true });
    expect(getRoamState()?.phase).toBe("home");
  });
});
