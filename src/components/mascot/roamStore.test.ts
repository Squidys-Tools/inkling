import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getRoamState,
  roamMotion,
  setRoamCaptureFailed,
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
  define("window", {
    innerWidth: 1600,
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
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
function goHome() {
  setRoamSpeed(600);
  for (let i = 0; i < 500 && getRoamState()?.phase !== "home"; i++) {
    frame(1000);
    stepRoam();
  }
  setRoamSpeed(1);
}

beforeEach(() => {
  saved = STUBBED.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  rafCb = null;
  clock = 0;
  stubBrowser();
  // The teardown matters: each watch registers another clock handler, and two
  // of them on one frame cancels the interval these tests are measuring.
  stopWatching = watchRoamInputs();
  setRoamSeed(3);
  goHome();
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
});
