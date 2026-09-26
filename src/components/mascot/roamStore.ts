/**
 * Glue between the wandering controller and the real library.
 *
 * The controller in `roam.ts` decides, this file knows where things are: it
 * measures the library, resolves the target the controller asked for, moves the
 * overlay, and hands the engine a face. It owns no animation loop of its own —
 * every decision rides the mascot engine's existing clock, which already stops
 * for a hidden tab and for reduced motion.
 *
 * Nothing here re-renders App. The overlay subscribes to a small snapshot that
 * only changes on a decision, so the 60fps frames stay inside the figures.
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
  type RoamTarget,
} from "./roam";
import {
  findSafeSpot,
  isSafeSpot,
  lookTargets,
  nearestSafeSpot,
  rectCenter,
  type Point,
  type Rect,
  type SpotPreference,
} from "./safeSpots";

/** The body state out in the library: a slow sway that keeps whatever face it is given. */
const ROAM_STATE = "inkling-sway" as const;

const CONTAINER_SELECTOR = ".main-content";
const MARK_SELECTOR = ".brand-mark";
/**
 * Anything the user reads, queried inside the container rather than by a
 * `.library-grid` ancestor. The serendipity view renders its one item as
 * `.serendipity-art > .library-card-slot > .library-card` with no grid above
 * it, and that view is exactly where the Keep and Forget buttons live, so a
 * grid-scoped query would hand the mascot the whole stage as free space.
 */
const CARD_SELECTOR = ".library-card";
const TOAST_SELECTOR = "[data-sonner-toast]";
/** Controls, chrome, and anything modal. The mascot is never allowed on them. */
const BLOCKERS = [
  ".capture-bar",
  ".library-toolbar",
  ".sidebar",
  ".expanded-overlay",
  ".capture-modal",
  ".settings-modal",
  ".pdf-viewer-overlay",
];

/** The virtualized window is the only thing in the DOM, but cap the walk anyway. */
const MAX_OBSTACLES = 90;

/**
 * Free space the mascot insists on. Without it the mascot squeezes into a
 * four-pixel sliver beside the grid, which reads as stuck rather than alive.
 */
const MIN_ROOM = 6;

/** Layout re-checks are throttled: a scroll must not become a layout storm. */
const RECHECK_MS = 300;

/** How long the hand-off to the sidebar takes at the end of a walk home. */
const FADE_MS = 320;

export interface RoamSnapshot {
  away: boolean;
  phase: RoamState["phase"];
  x: number;
  y: number;
  travelMs: number;
  /** ms to wait before the last of the walk home fades out */
  fadeMs: number;
  stops: number;
  last: { kind: RoamActionKind; target: RoamTarget; expression: string } | null;
}

interface Layout {
  container: Rect;
  obstacles: Rect[];
  cards: Rect[];
  home: Point;
}

/** A decision turned into a place, or a place to look at. */
interface Resolved {
  to: Point | null;
  look: Look | null;
}

const SPOT_PREFERENCE: Partial<Record<RoamTarget, SpotPreference>> = {
  near: "near",
  across: "across",
  margin: "margin",
};

let rand: Rand = Math.random;
let speed = 1;
let manual = false;
let state: RoamState | null = null;
let layout: Layout | null = null;
let hasRoom = false;
let position: Point | null = null;
let occupied = false;
let captureFailed = false;
let lastActivityAt = -Infinity;
let pointer: Point | null = null;
let needsCheck = true;
let lastCheckAt = 0;
let virtualNow = 0;
let lastRaw = 0;
let started = false;

let snapshot: RoamSnapshot = {
  away: false,
  phase: "home",
  x: 0,
  y: 0,
  travelMs: 0,
  fadeMs: 0,
  stops: 0,
  last: null,
};

const subs = new Set<() => void>();

function publish(next: Partial<RoamSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const fn of subs) fn();
}

// --- measuring ------------------------------------------------------------

function toRect(element: Element): Rect | null {
  const box = element.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function rectsOf(selector: string, limit: number): Rect[] {
  const out: Rect[] = [];
  for (const element of document.querySelectorAll(selector)) {
    if (out.length >= limit) break;
    const rect = toRect(element);
    if (rect) out.push(rect);
  }
  return out;
}

/** The same walk, confined to one subtree. */
function rectsWithin(root: Element, selector: string, limit: number): Rect[] {
  const out: Rect[] = [];
  for (const element of root.querySelectorAll(selector)) {
    if (out.length >= limit) break;
    const rect = toRect(element);
    if (rect) out.push(rect);
  }
  return out;
}

/** Where the mascot may go, measured now. null when the library is not on screen. */
function measure(): Layout | null {
  const containerElement = document.querySelector(CONTAINER_SELECTOR);
  const markElement = document.querySelector(MARK_SELECTOR);
  if (!containerElement || !markElement) return null;
  const container = toRect(containerElement);
  const mark = toRect(markElement);
  if (!container || !mark) return null;
  // A hidden sidebar (narrow layout) leaves the mark off screen, and then there
  // is nowhere to come home to, so the mascot stays put.
  if (mark.right < 0 || mark.left > window.innerWidth) return null;

  const cards = rectsWithin(containerElement, CARD_SELECTOR, MAX_OBSTACLES);
  const obstacles = [...cards, ...rectsOf(TOAST_SELECTOR, 4)];
  for (const selector of BLOCKERS) {
    const element = document.querySelector(selector);
    const rect = element ? toRect(element) : null;
    if (rect) obstacles.push(rect);
  }
  return { container, obstacles, cards, home: rectCenter(mark) };
}

/**
 * Measure, and answer both questions the caller has, from one search.
 *
 * `canStand` is "does the library have anywhere at all", which is what the
 * controller needs before it starts a walk. `nearest` is where the mascot should
 * stand if where it is standing has stopped being valid, which is what a resize
 * or a scroll needs. Asking both separately measured once and then searched the
 * candidate lattice twice, and a scroll is precisely the case where the current
 * position is invalid and the search is at its most expensive.
 */
function checkLayout(): { canStand: boolean; nearest: Point | null } {
  const next = measure();
  layout = next;
  needsCheck = false;
  lastCheckAt = virtualNow;
  if (!next) return { canStand: false, nearest: null };
  const from = position ?? next.home;
  if (isSafeSpot(from, next.container, next.obstacles, undefined, MIN_ROOM)) {
    return { canStand: true, nearest: from };
  }
  const nearest = nearestSafeSpot(next.container, next.obstacles, from, undefined, MIN_ROOM);
  return { canStand: nearest !== null, nearest };
}

/** A resize, a scroll, or new cards under the mascot: find somewhere valid again. */
function revalidate() {
  const { canStand, nearest } = checkLayout();
  hasRoom = canStand;
  if (position === null) return;
  if (nearest) {
    if (nearest.x !== position.x || nearest.y !== position.y) moveTo(nearest, 320, 0);
    return;
  }
  // A scroll put a card under the mascot and there is nowhere left to stand. The
  // walk ends rather than the mascot sitting on top of it.
  advance(virtualNow, true);
}

// --- resolving what the controller asked for ------------------------------

function gaze(from: Point, to: Point, mix: number): Look {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const reach = Math.max(200, Math.hypot(dx, dy));
  return { yaw: (dx / reach) * 35, pitch: (dy / reach) * 22, mix, spin: 0, wander: 0.2 };
}

function pickItem(): Point | null {
  if (!layout) return null;
  const targets = lookTargets(layout.container, layout.cards, position ?? layout.home);
  return targets[Math.floor(rand() * targets.length)] ?? null;
}

/** Turn a decision into a place. null means the library has no spot for it. */
function resolve(action: RoamAction): Resolved | null {
  if (!layout) return null;
  const from = position ?? layout.home;
  if (action.target === "home") return { to: layout.home, look: null };
  if (action.target === "item" || action.target === "activity") {
    const item = pickItem();
    const target = action.target === "activity" ? pointer ?? item : item;
    return { to: null, look: target ? gaze(from, target, 0.85) : null };
  }
  const want = SPOT_PREFERENCE[action.target];
  const base = { container: layout.container, obstacles: layout.obstacles, from, rand, minRoom: MIN_ROOM };
  // Every move but the departure has to be walkable end to end, so the search
  // itself demands a clear line rather than checking one afterwards. A spot the
  // mascot would have to glide over a card to reach is not a spot it can use.
  //
  // That is also how a crossing happens. The free space is a ring, so from a
  // margin the only reachable spots are the rest of that margin; once a shuffle
  // drifts the mascot up into the band under the search bar, the whole width
  // opens up and the far margin is a single clear leg away. It walks to the
  // corridor and along it rather than leaping the grid, which is both quieter
  // and the only route that is actually clear.
  const spot =
    position === null
      ? (want ? findSafeSpot({ ...base, prefer: want }) : null) ?? findSafeSpot({ ...base, prefer: "any" })
      : (want ? findSafeSpot({ ...base, prefer: want, clearPath: true }) : null) ??
        findSafeSpot({ ...base, prefer: "any", clearPath: true });
  return spot ? { to: spot, look: gaze(from, spot, 0.55) } : null;
}

function moveTo(to: Point, travelMs: number, fadeMs: number) {
  const mounted = position !== null;
  position = to;
  if (!mounted) {
    // Mount on the home mark first, then travel. Publishing the destination
    // straight away would put the mascot in the middle of the library on the
    // first frame, and the one move that has to read as leaving is the only one
    // that would not move at all.
    const from = layout?.home ?? to;
    publish({ x: from.x, y: from.y, travelMs: 0, fadeMs: 0 });
    requestAnimationFrame(() => {
      if (position) publish({ x: position.x, y: position.y, travelMs, fadeMs });
    });
    return;
  }
  publish({ x: to.x, y: to.y, travelMs, fadeMs });
}

function endOuting() {
  position = null;
    pushMascotLook(null);
  pushRoamParams(null);
  publish({ away: false, phase: "home", x: 0, y: 0, travelMs: 0, fadeMs: 0, stops: 0 });
}

function applyAction(action: RoamAction, resolved: Resolved | null) {
  if (action.kind === "arrive") {
    endOuting();
    return;
  }
  // A failed capture is worth one sad walk home, not a mascot that stays glum
  // until the next successful capture happens to clear the flag.
  if (action.expression === "triste") captureFailed = false;
  const walkingHome = action.kind === "go-home";
  // The last stretch of a walk home fades out, so the hand-off to the sidebar
  // figure is invisible instead of a jump cut.
  const fade = walkingHome ? Math.max(0, action.travel - FADE_MS) : 0;
  const to = resolved?.to ?? (walkingHome ? (layout?.home ?? null) : null);
  pushMascotLook(resolved?.look ?? null);
  pushRoamParams({ state: ROAM_STATE, expression: action.expression });
  if (to) moveTo(to, walkingHome ? action.travel - fade : action.travel, fade);
  publish({
    away: true,
    phase: walkingHome ? "returning" : "away",
    stops: state?.stops ?? 0,
    last: { kind: action.kind, target: action.target, expression: action.expression },
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
    canRoam: hasRoom,
    force,
  };
}

function advance(now: number, force = false) {
  if (!state) state = createRoamState(now, rand);
  if (needsCheck && (force || now - lastCheckAt >= RECHECK_MS)) hasRoom = checkLayout().canStand;

  const input = signals(force);
  const tick = tickRoam(state, input, rand);
  if (!tick.action) {
    state = tick.state;
    return;
  }
  const resolved = resolve(tick.action);
  if (resolved === null) {
    // Nowhere safe to stand. The outing ends on this same pass rather than the
    // mascot hovering a card while the controller looks for somewhere to go.
    const home = tickRoam(tick.state, { ...input, canRoam: false }, rand);
    state = home.state;
    if (home.action) applyAction(home.action, { to: layout?.home ?? null, look: null });
    return;
  }
  state = tick.state;
  applyAction(tick.action, resolved);
}

function onClock(clock: number) {
  const raw = clock * 1000;
  if (!started) {
    started = true;
    lastRaw = raw;
    virtualNow = raw;
  } else {
    virtualNow += (raw - lastRaw) * speed;
    lastRaw = raw;
  }
  if (manual) return;
  // While the mascot is out, the spot is re-checked on a timer as well as on
  // events. Cards mount lazily under a paused mascot, and nothing about that
  // announces itself as a resize. Walking home is excluded: the slot is inside
  // the sidebar, which is an obstacle like any other, so re-checking there would
  // find a library spot and turn the mascot around half way home.
  if (virtualNow - lastCheckAt >= RECHECK_MS && (needsCheck || position !== null) && state?.phase !== "returning") {
    revalidate();
  }
  advance(virtualNow);
}

// --- inputs ---------------------------------------------------------------

/**
 * Watch what the mascot watches. Deliberate input is what it reacts to, so a
 * mouse drifting across the window does not pull its gaze along; the position
 * is still recorded, because a glance at a moving cursor is worth having once
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
  window.addEventListener("scroll", act, capture);
  window.addEventListener("pointermove", track, capture);
  window.addEventListener("resize", invalidate, { passive: true });
  window.addEventListener("scroll", invalidate, capture);

  // The grid changes height as items arrive or leave, which moves cards under
  // the mascot without a scroll or a resize.
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(invalidate) : null;
  const container = document.querySelector(CONTAINER_SELECTOR);
  if (observer && container) observer.observe(container);

  const motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const onMotion = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches;
    invalidate();
  };
  motion?.addEventListener("change", onMotion);

  const stop = onMascotClock(onClock);
  return () => {
    window.removeEventListener("pointerdown", act, capture);
    window.removeEventListener("keydown", act, capture);
    window.removeEventListener("wheel", act, capture);
    window.removeEventListener("input", act, capture);
    window.removeEventListener("scroll", act, capture);
    window.removeEventListener("pointermove", track, capture);
    window.removeEventListener("resize", invalidate);
    window.removeEventListener("scroll", invalidate, capture);
    motion?.removeEventListener("change", onMotion);
    observer?.disconnect();
    stop();
  };
}

function invalidate() {
  needsCheck = true;
}

/** An overlay, dialog, menu, or reader owns the screen: hold still, keep the budget. */
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
  speed = Math.max(0.1, Math.min(600, multiplier));
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

/** The overlay's view. Changes once per decision, not once per frame. */
export function useRoam(): RoamSnapshot {
  return useSyncExternalStore(subscribeRoam, getRoamSnapshot);
}

