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
const CARD_SELECTOR = ".library-grid .library-card";
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

  const cards = rectsOf(CARD_SELECTOR, MAX_OBSTACLES);
  const obstacles = [...cards, ...rectsOf(TOAST_SELECTOR, 4)];
  for (const selector of BLOCKERS) {
    const element = document.querySelector(selector);
    const rect = element ? toRect(element) : null;
    if (rect) obstacles.push(rect);
  }
  return { container, obstacles, cards, home: rectCenter(mark) };
}

/** Whether the library has anywhere to stand at all. */
function roomExists(next: Layout | null): boolean {
  if (!next) return false;
  if (position && isSafeSpot(position, next.container, next.obstacles, undefined, MIN_ROOM)) return true;
  return nearestSafeSpot(next.container, next.obstacles, position ?? next.home, undefined, MIN_ROOM) !== null;
}

function refreshLayout() {
  layout = measure();
  hasRoom = roomExists(layout);
  needsCheck = false;
  lastCheckAt = virtualNow;
}

/** A resize, a scroll, or new cards under the mascot: find somewhere valid again. */
function revalidate() {
  refreshLayout();
  if (position === null || !layout) return;
  if (isSafeSpot(position, layout.container, layout.obstacles, undefined, MIN_ROOM)) return;
  const safe = nearestSafeSpot(layout.container, layout.obstacles, position, undefined, MIN_ROOM);
  if (safe) {
    moveTo(safe, 320, 0);
    return;
  }
  // A scroll put a card under the mascot and there is nowhere left to stand. The
  // walk ends rather than the mascot sitting on top of it.
  hasRoom = false;
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
  const search = { container: layout.container, obstacles: layout.obstacles, from, rand, minRoom: MIN_ROOM };
  // A crossing with nowhere to cross becomes a shorter shuffle, which is what a
  // small library does to a curious mascot anyway.
  const spot = (want ? findSafeSpot({ ...search, prefer: want }) : null) ?? findSafeSpot({ ...search, prefer: "any" });
  return spot ? { to: spot, look: gaze(from, spot, 0.55) } : null;
}

function moveTo(to: Point, travelMs: number, fadeMs: number) {
  const mounted = position !== null;
  position = to;
  if (!mounted) {
    // Mount on the home mark first, so leaving reads as leaving instead of the
    // mascot appearing in the middle of the library.
    publish({ x: to.x, y: to.y, travelMs: 0, fadeMs: 0 });
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

function signals(force: boolean) {
  return {
    now: virtualNow,
    lastActivityAt,
    occupied,
    captureFailed,
    reducedMotion: prefersReducedMotion(),
    hidden: typeof document !== "undefined" && document.hidden,
    canRoam: hasRoom,
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
  // announces itself as a resize.
  if (virtualNow - lastCheckAt >= RECHECK_MS && (needsCheck || position !== null)) revalidate();
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

  const act = () => {
    lastActivityAt = performance.now();
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
  motion?.addEventListener("change", invalidate);

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
    motion?.removeEventListener("change", invalidate);
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

/** Leave now, without waiting out the first 90 to 180 seconds. */
export function forceRoamOuting() {
  advance(virtualNow, true);
}

/** One decision at a time, for reading the wandering model. */
export function stepRoamOnce() {
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
