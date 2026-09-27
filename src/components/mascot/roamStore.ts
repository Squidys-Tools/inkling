/**
 * Glue between the wandering controller and the real library.
 *
 * The controller in `roam.ts` decides, this file knows where things are: it
 * measures the library, turns a decision into somewhere to drift toward, moves
 * the overlay, and hands the engine a face. It owns no animation loop of its
 * own - every frame rides the mascot engine's existing clock, which already
 * stops for a hidden tab and for reduced motion.
 *
 * Nothing here re-renders React at frame rate. The overlay registers its node
 * and this file writes one transform to it per frame; React only hears about
 * mounting and unmounting, which happens twice an outing.
 */

import { useSyncExternalStore } from "react";
import type { Look } from "./bot/engine";
import { onMascotClock, prefersReducedMotion, pushMascotLook, pushRoamParams } from "./mascotStore";
import {
  awakeLeft,
  createRoamState,
  createSeededRandom,
  tickRoam,
  type Rand,
  type RoamAction,
  type RoamActionKind,
  type RoamState,
} from "./roam";
import { drift, type Bounds, type DriftState, type Vec } from "./drift";
import { MASCOT_SIZE, lookTargets, pickTarget, roamBounds, type TargetPreference } from "./roamSpace";

/** The body state out in the library: a slow sway that keeps whatever face it is given. */
const ROAM_STATE = "inkling-sway" as const;

const CONTAINER_SELECTOR = ".main-content";
const MARK_SELECTOR = ".brand-mark";
const CARD_SELECTOR = ".library-card";

/** The virtualized window is the only thing in the DOM, but cap the gaze set. */
const MAX_CARDS = 60;

/** Layout re-checks are throttled: a scroll must not become a layout storm. */
const RECHECK_MS = 500;

/**
 * The only two moments the mascot is not drifting. It appears when it leaves the
 * slot and it disappears when it goes back, and both are a squash rather than a
 * move, because a move is what it does everything else now.
 *
 * Slow on purpose. A blot that vanishes and reappears is doing something
 * physical, and hurrying it reads as a glitch in the app rather than something
 * alive deciding to be elsewhere.
 */
const HOP_SHRINK_MS = 280;
const HOP_SHRINK_EASE = "cubic-bezier(.5,0,.9,.4)";
const HOP_SHRINK_TO = 0;
const HOP_GROW_MS = 460;
const HOP_GROW_EASE = "cubic-bezier(.18,1.28,.36,1)";

export interface RoamSnapshot {
  away: boolean;
  phase: RoamState["phase"];
  stops: number;
  last: { kind: RoamActionKind; target: string; expression: string } | null;
}

interface Layout {
  /** The panel it moves inside. */
  panel: Bounds;
  /** The same, inset, which is the actual room. */
  room: Bounds;
  /** Card rectangles, for looking at. Never for standing on. */
  cards: Bounds[];
  home: Vec;
}

const TARGET_PREFERENCE: Record<string, TargetPreference> = {
  near: "near",
  across: "across",
  margin: "edge",
  item: "any",
  activity: "near",
  home: "any",
};

let rand: Rand = Math.random;
let clockScale = 1;
let manual = false;
let state: RoamState | null = null;
let layout: Layout | null = null;
let bounds: Bounds | null = null;
let occupied = false;
let captureFailed = false;
let lastActivityAt = -Infinity;
let pointer: Vec | null = null;
let needsCheck = true;
let lastCheckAt = 0;
let virtualNow = 0;
let lastRaw = 0;
let started = false;

/** Where the mascot is right now, and which way it is looking to get somewhere. */
let motion: DriftState = { x: 0, y: 0, heading: 0, speed: 0 };
/** What it is currently drifting toward. */
let target: Vec | null = null;
let legStartedAt = 0;
let looking: Look | null = null;

let node: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;

/**
 * The overlay hands over its nodes as callback refs, because it renders null
 * until an outing starts and an effect would never see them. They are written to
 * directly once per frame, which is the whole reason the mascot can move
 * continuously without re-rendering anything.
 */
export function setRoamNode(outer: HTMLDivElement | null) {
  node = outer;
}

export function setRoamBody(inner: HTMLDivElement | null) {
  body = inner;
}


let snapshot: RoamSnapshot = {
  away: false,
  phase: "home",
  stops: 0,
  last: null,
};

const subs = new Set<() => void>();

function publish(next: Partial<RoamSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const fn of subs) fn();
}

function paint(x: number, y: number) {

  if (!node) return;
  const half = MASCOT_SIZE / 2;
  node.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;
}


// --- measuring ------------------------------------------------------------

function toBounds(element: Element): Bounds | null {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function cardBounds(root: Element): Bounds[] {
  const out: Bounds[] = [];
  for (const element of root.querySelectorAll(CARD_SELECTOR)) {
    if (out.length >= MAX_CARDS) break;
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    out.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
  }
  return out;
}

/** Where the library is. null when it is not on screen, e.g. a collapsed sidebar. */
function measure(): Layout | null {
  const panelElement = document.querySelector(CONTAINER_SELECTOR);
  const markElement = document.querySelector(MARK_SELECTOR);
  if (!panelElement || !markElement) return null;
  const panel = toBounds(panelElement);
  const mark = toBounds(markElement);
  if (!panel || !mark) return null;
  // A hidden sidebar leaves the mark off screen, and then there is nowhere to
  // come home to, so the mascot stays put.
  if (mark.right < 0 || mark.left > window.innerWidth) return null;
  return {
    panel,
    room: roamBounds(panel),
    cards: cardBounds(panelElement),
    home: { x: (mark.left + mark.right) / 2, y: (mark.top + mark.bottom) / 2 },
  };
}

function refreshLayout() {
  layout = measure();
  bounds = layout?.room ?? null;
  needsCheck = false;
  lastCheckAt = virtualNow;
  if (!bounds) return;
  // A resize or a scroll can leave the mascot outside the room it is now in.
  // There is nothing to avoid, so the only correction is putting it back in.
  const pad = 8;
  if (motion.x < bounds.left + pad) motion.x = bounds.left + pad;
  if (motion.x > bounds.right - pad) motion.x = bounds.right - pad;
  if (motion.y < bounds.top + pad) motion.y = bounds.top + pad;
  if (motion.y > bounds.bottom - pad) motion.y = bounds.bottom - pad;
}

// --- deciding -------------------------------------------------------------

function gaze(from: Vec, to: Vec, mix: number): Look {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const reach = Math.max(200, Math.hypot(dx, dy));
  return { yaw: (dx / reach) * 35, pitch: (dy / reach) * 22, mix, spin: 0, wander: 0.2 };
}

function pickGazePoint(): Vec | null {
  if (!layout) return null;
  const points = lookTargets(layout.panel, layout.cards, motion);
  return points[Math.floor(rand() * points.length)] ?? null;
}

/**
 * Turn a decision into a place to drift toward.
 *
 * null means there is nowhere to go, which only happens when the library is not
 * on screen at all. There is no longer a notion of a spot being refused.
 */
function resolve(action: RoamAction): { to: Vec | null; look: Look | null } | null {
  if (!layout || !bounds) return null;
  if (action.target === "home") return { to: layout.home, look: null };
  if (action.target === "item" || action.target === "activity") {
    const point = pickGazePoint();
    // Looking at something and drifting toward the general area of it is the
    // whole difference between a mascot that is aware of the library and one
    // that is drifting through an empty room.
    const toward = action.target === "activity" ? pointer ?? point : point;
    const to = toward
      ? pickTarget(bounds, motion, toward.x > motion.x ? "across" : "any", rand)
      : pickTarget(bounds, motion, "any", rand);
    return { to, look: toward ? gaze(motion, toward, 0.85) : null };
  }
  const to = pickTarget(bounds, motion, TARGET_PREFERENCE[action.target] ?? "any", rand);
  return { to, look: gaze(motion, to, 0.5) };
}

// --- the squash -----------------------------------------------------------

let hopSeq = 0;
let hopTimer: ReturnType<typeof setTimeout> | null = null;

function clearHop() {
  if (hopTimer !== null) {
    clearTimeout(hopTimer);
    hopTimer = null;
  }
}

/** One style write, so the squash reads the same whether React knows or not. */
function paintScale(scale: number, hopMs: number, ease: string) {
  if (!body) return;
  body.style.transform = `scale(${scale})`;
  body.style.transition = `transform ${hopMs}ms ${ease}`;
}

function hopHome() {
  clearHop();
  const seq = ++hopSeq;
  // Shrink away where it is, then the overlay unmounts and the slot takes over.
  paintScale(HOP_SHRINK_TO, HOP_SHRINK_MS, HOP_SHRINK_EASE);
  hopTimer = setTimeout(() => {
    hopTimer = null;
    if (seq !== hopSeq) return;
    finishOuting();
  }, HOP_SHRINK_MS);
}

function finishOuting() {
  motion = { x: 0, y: 0, heading: 0, speed: 0 };
  target = null;
  looking = null;
  pushMascotLook(null);
  pushRoamParams(null);
  publish({ away: false, phase: "home", stops: 0, last: null });
}

function beginOuting(to: Vec) {
  clearHop();
  const seq = ++hopSeq;
  // Start from the slot, so leaving reads as leaving. The body mounts at zero
  // size from its stylesheet, so the frame the node is created in shows nothing
  // and the store places it on the very next frame, before it is ever visible.
  motion = { x: to.x, y: to.y, heading: motion.heading, speed: 0 };
  target = to;
  legStartedAt = virtualNow;
  publish({ away: true, phase: "away" });
  requestAnimationFrame(() => {
    if (seq !== hopSeq) return;
    paintScale(1, HOP_GROW_MS, HOP_GROW_EASE);
  });
}


// --- the loop -------------------------------------------------------------

/**
 * Reduced motion is read once and cached, not asked for sixty times a second:
 * `signals()` runs inside the mascot's own frame callback, and building a fresh
 * MediaQueryList per frame is work the engine does not need.
 */
let reducedMotion = false;

function signals(force: boolean) {
  return {
    now: virtualNow,
    lastActivityAt,
    occupied,
    captureFailed,
    reducedMotion,
    hidden: typeof document !== "undefined" && document.hidden,
    canRoam: bounds !== null,
    force,
  };
}

function advance(now: number, force = false) {
  if (!state) state = createRoamState(now, rand);
  if (needsCheck && (force || now - lastCheckAt >= RECHECK_MS)) refreshLayout();

  const input = signals(force);
  const tick = tickRoam(state, input, rand);
  if (!tick.action) {
    state = tick.state;
    return;
  }
  state = tick.state;
  const action = tick.action;

  if (action.kind === "arrive") {
    hopHome();
    return;
  }
  // A failed capture is worth one sad walk home, not a mascot that stays glum
  // until the next successful capture happens to clear the flag.
  if (action.expression === "triste") captureFailed = false;
  pushRoamParams({ state: ROAM_STATE, expression: action.expression });

  const walkingHome = action.kind === "go-home";
  if (walkingHome) {
    target = layout?.home ?? null;
    legStartedAt = now;
    publish({ phase: "returning", stops: state.stops, last: describe(action) });
    return;
  }

  const resolved = resolve(action);
  if (!resolved) {
    // Nowhere to go at all, so the walk is over rather than the mascot hovering
    // in an empty room waiting for somewhere to appear.
    target = layout?.home ?? null;
    publish({ phase: "returning", stops: state.stops, last: describe(action) });
    return;
  }
  looking = resolved.look;
  pushMascotLook(looking);
  if (!snapshot.away && resolved.to) {
    beginOuting(resolved.to);
    return;
  }
  target = resolved.to;
  legStartedAt = now;
  publish({ phase: "away", stops: state.stops, last: describe(action) });
}

function describe(action: RoamAction): RoamSnapshot["last"] {
  return { kind: action.kind, target: action.target, expression: action.expression };
}

/**
 * The frame. Steer, write the transform, and let the controller decide when the
 * next leg starts. This runs on the mascot engine's rAF, which is already going,
 * so continuous movement costs no additional loop.
 */
function onClock(clock: number) {
  const raw = clock * 1000;
  if (!started) {
    started = true;
    lastRaw = raw;
    virtualNow = raw;
  } else {
    virtualNow += (raw - lastRaw) * clockScale;
    lastRaw = raw;
  }
  if (manual) return;

  const seconds = Math.min((raw - lastRaw) / 1000, 0.05) || 0.016;
  if (snapshot.away && bounds) {
    if (needsCheck && virtualNow - lastCheckAt >= RECHECK_MS) refreshLayout();
    if (target) {
      // The room is the inset library, which does not include the sidebar slot,
      // so a target outside it - which is exactly the walk home - would be pushed
      // back inside forever and the mascot could never get home. Contain against
      // the union of the room and wherever it is headed.
      const room = target
        ? {
            left: Math.min(bounds.left, target.x),
            top: Math.min(bounds.top, target.y),
            right: Math.max(bounds.right, target.x),
            bottom: Math.max(bounds.bottom, target.y),
          }
        : bounds;
      motion = drift(motion, target, room, seconds, (virtualNow - legStartedAt) / 1000);
    }
    paint(motion.x, motion.y);
  }
  advance(virtualNow);
}


// --- inputs ---------------------------------------------------------------

/**
 * Watch what the mascot watches. Deliberate input is what it reacts to, so a
 * mouse drifting across the window does not pull its gaze along; the position is
 * still recorded, because a glance at a moving cursor is worth having once
 * something else is happening.
 */
export function watchRoamInputs(): () => void {
  if (typeof window === "undefined") return () => {};
  reducedMotion = prefersReducedMotion();

  const act = () => {
    // Stamped on the mascot's own clock, not on `performance.now()`. The
    // controller asks "was the user doing something in the last four seconds",
    // and it asks it with `virtualNow`. That clock halts on a hidden tab and
    // under reduced motion while the wall clock does not, so a raw stamp goes
    // stale in the wrong direction: after any backgrounded stretch the mascot
    // reads the user as permanently active and every glance tracks the last
    // pointer position instead of the item in front of it.
    lastActivityAt = virtualNow;
  };
  const track = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
  };
  const capture = { capture: true, passive: true } as const;

  window.addEventListener("pointerdown", act, capture);
  window.addEventListener("keydown", act, capture);
  window.addEventListener("wheel", act, capture);
  window.addEventListener("input", act, capture);
  window.addEventListener("scroll", invalidate, capture);
  window.addEventListener("pointermove", track, capture);
  window.addEventListener("resize", invalidate, { passive: true });
  window.addEventListener("scroll", invalidate, capture);

  // The grid changes height as items arrive or leave, which moves the room
  // around the mascot without a scroll or a resize.
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(invalidate) : null;
  const container = document.querySelector(CONTAINER_SELECTOR);
  if (observer && container) observer.observe(container);

  const motionQuery =
    typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const onMotion = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches;
    invalidate();
  };
  motionQuery?.addEventListener("change", onMotion);

  const stop = onMascotClock(onClock);
  return () => {
    window.removeEventListener("pointerdown", act, capture);
    window.removeEventListener("keydown", act, capture);
    window.removeEventListener("wheel", act, capture);
    window.removeEventListener("input", act, capture);
    window.removeEventListener("pointermove", track, capture);
    window.removeEventListener("resize", invalidate);
    window.removeEventListener("scroll", invalidate, capture);
    motionQuery?.removeEventListener("change", onMotion);
    observer?.disconnect();
    stop();
  };
}

function invalidate() {
  needsCheck = true;
}

/** A view, dialog, reader, or a drag owns the screen: hold still, keep the budget. */
export function setRoamBusy(busy: boolean) {
  occupied = busy;
}

/** A failed capture ends the outing. It is the one thing that does. */
export function setRoamCaptureFailed(failed: boolean) {
  captureFailed = failed;
}

export function getRoamState(): RoamState | null {
  return state;
}

/** Awake time left in the current outing, for the dev board's readout. */
export function roamAwakeLeft(): number {
  return state ? awakeLeft(state) : 0;
}

// --- dev board controls ---------------------------------------------------

/**
 * Decide now instead of at the scheduled time. Forcing the first decision is
 * also what "leave now" means, and on the dev board it is the same button as
 * stepping: the controller has no notion of a step, only of a due time.
 */
export function stepRoam() {
  advance(virtualNow, true);
}

export function setRoamSpeed(multiplier: number) {
  clockScale = Math.max(0.1, Math.min(600, multiplier));
}

export function setRoamSeed(next: number) {
  rand = createSeededRandom(next);
}

export function setRoamManual(enabled: boolean) {
  manual = enabled;
}

// --- react ----------------------------------------------------------------

function subscribeRoam(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

function getRoamSnapshot(): RoamSnapshot {
  return snapshot;
}

/**
 * Whether the mascot is out of its slot. The overlay mounts and unmounts on this
 * and on nothing else: the frames are written straight to its nodes, so a
 * wandering mascot costs one transform per frame and zero React renders.
 */
export function useRoam(): RoamSnapshot {
  return useSyncExternalStore(subscribeRoam, getRoamSnapshot);
}



