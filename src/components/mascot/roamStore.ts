/**
 * Glue between the wandering controller and the real library.
 *
 * The controller in `roam.ts` decides when and with what face. This file knows
 * where things are: it measures the library, keeps the mascot somewhere legal,
 * moves it, and hands the engine a face. It owns no animation loop of its own -
 * every frame rides the mascot engine's existing clock, which already stops for a
 * hidden tab and for reduced motion.
 *
 * The movement is a direction, not a destination. The mascot is told which way to
 * go and left to get on with it, sliding along the card grid if it drifts into
 * one. Every so often the controller asks for a different part of the library and
 * the mascot squashes out and swells up somewhere else instead.
 *
 * Nothing here re-renders React at frame rate. The overlay registers its nodes
 * and this file writes one transform per frame; React only hears about mounting
 * and unmounting, which happens twice an outing.
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
import {
  CRUISE_SPEED,
  MASCOT_SIZE,
  STALL_FRACTION,
  deflectedAim,
  drift,
  headingOf,
  pickDirection,
  speedOf,
  type DriftState,
  type Rect,
  type Terrain,
  type Vec,
} from "./drift";
import { farPoint, freePoint, hasRoom, lookTargets, terrainFor } from "./roamSpace";

/** The body state out in the library: a slow sway that keeps whatever face it is given. */
const ROAM_STATE = "inkling-sway" as const;

const CONTAINER_SELECTOR = ".app-shell";
const MARK_SELECTOR = ".brand-mark";
/**
 * The one thing it is not allowed to be on. The card grid is the user's content
 * and the mascot is never over it; everything else in the app, the sidebar and
 * the strips of controls included, is somewhere it is allowed to be. The controls
 * were walls for a while on the grounds that a blot on the search field hides
 * what you were aiming at, which is fair, and it cost the mascot most of the
 * library to walk in - so they are open again and it is decoration over a control
 * rather than an obstruction to it.
 */
const BLOCKER_SELECTORS = [".library-grid"];
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
const HOP_SHRINK_MS = 300;
const HOP_SHRINK_EASE = "cubic-bezier(.5,0,.9,.4)";
const HOP_SHRINK_TO = 0;
const HOP_GROW_MS = 480;
const HOP_GROW_EASE = "cubic-bezier(.18,1.28,.36,1)";

/**
 * How long it stays in one part of the library before it will consider blinking
 * somewhere else. Wandering and relocating are different things, and a mascot
 * that does both at the same rate is only ever doing one of them.
 */
const MIN_DWELL_MS = 3_200;

/**
 * How much a leg varies its pace. Every leg is a little different, because a
 * mascot that moves at exactly one speed every time is a machine on rails.
 */
const CRUISE_JITTER = 0.35;

export interface RoamSnapshot {
  away: boolean;
  phase: RoamState["phase"];
  stops: number;
  last: { kind: RoamActionKind; target: string; expression: string } | null;
}

interface Layout {
  panel: Rect;
  terrain: Terrain;
  /** Card rectangles, for looking at. Never for standing on. */
  cards: Rect[];
  home: Vec;
}

let rand: Rand = Math.random;
let clockScale = 1;
let manual = false;
let state: RoamState | null = null;
let layout: Layout | null = null;
let terrain: Terrain | null = null;
let occupied = false;
let captureFailed = false;
let lastActivityAt = -Infinity;
let pointer: Vec | null = null;
let needsCheck = true;
let lastCheckAt = 0;
let virtualNow = 0;
let lastRaw = 0;
let started = false;

let motion: DriftState = { x: 0, y: 0, vx: 0, vy: 0 };
/** The direction it was last told to head in, or null to keep its own. */
let aim: number | null = null;
/** This leg's pace. */
let cruise = CRUISE_SPEED;
/** A random offset on the sway, so no two legs drift on the same line. */
let swayPhase = 0;
let legStartedAt = 0;
/** When it last appeared somewhere, which is what the dwell is measured from. */
let lastPlacedAt = -Infinity;
let looking: Look | null = null;

let node: HTMLDivElement | null = null;
let body: HTMLDivElement | null = null;

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

function paint(x: number, y: number) {
  if (!node) return;
  const half = MASCOT_SIZE / 2;
  node.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;
}

// --- measuring ------------------------------------------------------------

function toRect(element: Element): Rect | null {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function cardRects(root: Element): Rect[] {
  const out: Rect[] = [];
  for (const element of root.querySelectorAll(CARD_SELECTOR)) {
    if (out.length >= MAX_CARDS) break;
    const rect = toRect(element);
    if (rect) out.push(rect);
  }
  return out;
}

/** Where the library is. null when it is not on screen, e.g. a collapsed sidebar. */
function measure(): Layout | null {
  const panelElement = document.querySelector(CONTAINER_SELECTOR);
  const markElement = document.querySelector(MARK_SELECTOR);
  if (!panelElement || !markElement) return null;
  const panel = toRect(panelElement);
  const mark = toRect(markElement);
  if (!panel || !mark) return null;
  // A hidden sidebar leaves the mark off screen, and then there is nowhere to
  // come home to, so the mascot stays put.
  if (mark.right < 0 || mark.left > window.innerWidth) return null;
  return {
    panel,
    terrain: terrainFor(panel, BLOCKER_SELECTORS.map((selector) => toRect(document.querySelector(selector) ?? panelElement))),
    cards: cardRects(panelElement),
    home: { x: (mark.left + mark.right) / 2, y: (mark.top + mark.bottom) / 2 },
  };
}

function refreshLayout() {
  layout = measure();
  terrain = layout?.terrain ?? null;
  needsCheck = false;
  lastCheckAt = virtualNow;
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

/** A new direction, and a new pace to go at it with. */
function chooseLeg(from: Vec) {
  aim = pickDirection(rand);
  cruise = CRUISE_SPEED * (1 - CRUISE_JITTER + rand() * CRUISE_JITTER * 2);
  swayPhase = rand() * Math.PI * 2;
  legStartedAt = virtualNow;
  void from;
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

/**
 * The squash is an intent, applied by the frame loop rather than written once.
 *
 * It used to be a requestAnimationFrame fired in the same tick as the publish
 * that mounts the overlay, and the node did not exist yet, so the write was
 * dropped and the mascot sat at its stylesheet size of zero for the rest of the
 * outing. The position does not have this problem because it is written every
 * frame anyway, which is exactly why only the scale went missing. Retrying from
 * the loop means a write that finds no node simply happens on the next frame.
 */
let wantScale = 1;
let wantTransition = "";
let appliedScale = Number.NaN;
let appliedTransition = "";

function applyScale() {
  if (!body) return;
  if (wantScale === appliedScale && wantTransition === appliedTransition) return;
  appliedScale = wantScale;
  appliedTransition = wantTransition;
  body.style.transform = `scale(${wantScale})`;
  body.style.transition = wantTransition || "none";
}

function setSquash(scale: number, ms: number, ease: string) {
  wantScale = scale;
  wantTransition = `transform ${ms}ms ${ease}`;
}

function growInto(point: Vec) {
  motion = { x: point.x, y: point.y, vx: 0, vy: 0 };
  lastPlacedAt = virtualNow;
  // Put it where it is going while it is still invisible, so the swell is
  // somewhere new rather than a slide across the library.
  paint(point.x, point.y);
  chooseLeg(point);
  setSquash(1, HOP_GROW_MS, HOP_GROW_EASE);
  applyScale();
}

/**
 * Shrink, sit invisible, swell up somewhere else, pick a direction.
 *
 * One generation bump per hop. An earlier version bumped it in the caller and
 * again inside the squash helper, so the guard below always tripped, the swell
 * never ran, and the mascot shrank out of an outing and stayed at zero for the
 * rest of it.
 */
function hopTo(point: Vec) {
  clearHop();
  const seq = ++hopSeq;
  setSquash(HOP_SHRINK_TO, HOP_SHRINK_MS, HOP_SHRINK_EASE);
  applyScale();
  hopTimer = setTimeout(() => {
    hopTimer = null;
    if (seq !== hopSeq) return;
    growInto(point);
  }, HOP_SHRINK_MS);
}

function hopOut() {
  clearHop();
  ++hopSeq;
  setSquash(HOP_SHRINK_TO, HOP_SHRINK_MS, HOP_SHRINK_EASE);
  applyScale();
  hopTimer = setTimeout(() => {
    hopTimer = null;
    finishOuting();
  }, HOP_SHRINK_MS);
}

function finishOuting() {
  motion = { x: 0, y: 0, vx: 0, vy: 0 };
  aim = null;
  looking = null;
  wantScale = 1;
  wantTransition = "";
  pushMascotLook(null);
  pushRoamParams(null);
  publish({ away: false, phase: "home", stops: 0, last: null });
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
    canRoam: terrain !== null && hasRoom(terrain),
    force,
  };
}

/** A view, dialog, reader, or a drag owns the screen: hold still, keep the budget. */
function holding() {
  return occupied;
}

function advance(now: number, force = false) {
  if (!state) state = createRoamState(now, rand);
  if (needsCheck && (force || now - lastCheckAt >= RECHECK_MS)) refreshLayout();

  const tick = tickRoam(state, signals(force), rand);
  if (!tick.action) {
    state = tick.state;
    return;
  }
  state = tick.state;
  const action = tick.action;

  if (action.kind === "arrive") {
    hopOut();
    return;
  }

  // A failed capture is worth one sad walk home, not a mascot that stays glum
  // until the next successful capture happens to clear the flag.
  if (action.expression === "triste") captureFailed = false;
  pushRoamParams({ state: ROAM_STATE, expression: action.expression });

  if (!terrain) return;

  if (action.kind === "go-home") {
    looking = null;
    pushMascotLook(null);
    aim = Math.atan2(layout!.home.y - motion.y, layout!.home.x - motion.x);
    legStartedAt = now;
    publish({ phase: "returning", stops: state.stops, last: describe(action) });
    return;
  }

  // A glance, and a new direction to carry on in. Looking is not a place.
  if (action.target === "item" || action.target === "activity") {
    const point = action.target === "activity" ? pointer ?? pickGazePoint() : pickGazePoint();
    looking = point ? gaze(motion, point, 0.85) : null;
    pushMascotLook(looking);
  }

  if (!snapshot.away) {
    // First thing it does when it leaves: swell up somewhere in the free space,
    // already facing the direction it is about to set off in.
    const start = freePoint(terrain, rand) ?? layout!.home;
    motion = { x: start.x, y: start.y, vx: 0, vy: 0 };
    chooseLeg(start);
    publish({ away: true, phase: "away", stops: state.stops, last: describe(action) });
    growInto(start);
    return;
  }


  // A crossing or a drift to the margins is a request to be somewhere else, and
  // the only way to be somewhere else without crossing the grid is to go there.
  // Not while the user is mid-dialog, and not before it has been here a while: a
  // recording of the first version of this had it blinking across the library
  // every two seconds, which is not roaming, it is teleporting with a delay. It
  // wanders in one part for a few seconds first, and only then moves.
  const settled = virtualNow - lastPlacedAt >= MIN_DWELL_MS;
  const relocating = settled && !holding() && (action.target === "across" || action.target === "margin");
  if (relocating) {
    const elsewhere = farPoint(terrain, motion, rand);
    if (elsewhere) {
      hopTo(elsewhere);
      publish({ phase: "away", stops: state.stops, last: describe(action) });
      return;
    }
  }


  chooseLeg(motion);
  publish({ phase: "away", stops: state.stops, last: describe(action) });
}

function describe(action: RoamAction): RoamSnapshot["last"] {
  return { kind: action.kind, target: action.target, expression: action.expression };
}

/**
 * The frame. One style write, and the controller decides when the next leg starts.
 * This runs on the mascot engine's rAF, which is already going, so continuous
 * movement costs no additional loop.
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

  if (snapshot.away && terrain) {
    const seconds = Math.min((raw - lastRaw) / 1000, 0.05) || 0.016;
    if (needsCheck && virtualNow - lastCheckAt >= RECHECK_MS) refreshLayout();
    if (terrain) {
      motion = holding()
        ? motion
        : drift(motion, terrain, seconds, (virtualNow - legStartedAt) / 1000, aim, cruise, swayPhase);
      // A wall pushes the mascot off its heading. Take the deflected direction as
      // the new aim, so it slides along the grid and carries on instead of
      // pressing into it for the rest of the leg, which reads as stuck. And if it
      // walked into something head on and stopped dead, the direction that did it
      // is no use to it: pick a fresh one.
      if (speedOf(motion) < cruise * STALL_FRACTION) chooseLeg(motion);
      else aim = deflectedAim(aim, motion);
      paint(motion.x, motion.y);
    }
  }
  // Applied every frame whether or not the mascot is out, so a squash requested
  // in the same tick the overlay mounts lands on the first frame that has a node.
  applyScale();
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

  // The grid changes height as items arrive or leave, which moves the wall the
  // mascot is drifting along without a scroll or a resize.
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

/** Where it is and how fast, for the dev board. */
export function roamMotion(): { x: number; y: number; speed: number; heading: number } {
  return { x: Math.round(motion.x), y: Math.round(motion.y), speed: +speedOf(motion).toFixed(1), heading: +headingOf(motion).toFixed(2) };
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





