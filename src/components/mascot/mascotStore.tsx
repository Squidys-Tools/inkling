import { useSyncExternalStore } from "react";
import { BotEngine, type BotFrame, type Look } from "./bot/engine";
import { EXPRESSION_BY_ID, DEFAULT_EXPRESSION } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { RAYON } from "./bot/repere";
import type { StateId } from "./bot/states";
import { MascotFigure, MascotSearchEyes } from "./MascotFigure";

export interface MascotParams {
  state: StateId;
  expression: string;
}

/**
 * One shared engine for the live app slots (sidebar mark, search field), so
 * the mascot can move between slots without resetting its clock — and so the
 * 60fps frame state never re-renders App, only the subscribed figures.
 *
 * The loop pauses when the tab is hidden or when motion is reduced (params
 * still apply as a single sampled frame). Without requestAnimationFrame
 * (tests) every push samples immediately.
 */
const engine = new BotEngine(
  RAYON,
  "inkling-drift",
  SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
  EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null,
);

let clock = 0;
let frame: BotFrame = engine.sample(0);
let raf = 0;
let running = false;
const subs = new Set<() => void>();
const frameListeners = new Set<(frame: BotFrame, clock: number) => void>();
let baseParams: MascotParams = { state: "inkling-drift", expression: "neutre" };
let roamParams: MascotParams | null = null;
let appliedParams: MascotParams = baseParams;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function emit() {
  for (const fn of subs) fn();
}

function notifyFrameListeners() {
  for (const fn of frameListeners) fn(frame, clock);
}

function tick(ms: number) {
  raf = requestAnimationFrame(tick);
  const dt = lastMs ? Math.min((ms - lastMs) / 1000, 0.064) : 0;
  lastMs = ms;
  clock += dt;
  frame = engine.sample(clock);
  notifyFrameListeners();
  emit();
}

let lastMs = 0;

function ensureLoop() {
  if (running || typeof requestAnimationFrame !== "function") return;
  if (prefersReducedMotion()) return;
  if (typeof document !== "undefined" && document.hidden) return;
  running = true;
  lastMs = 0;
  raf = requestAnimationFrame(tick);
}

function haltLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(raf);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) haltLoop();
    else if (subs.size > 0) ensureLoop();
  });
}

// The OS reduced-motion setting can flip while the app is open. Without this
// the loop would keep running after opting into reduced motion, and never
// restart after opting out (subscribers stay mounted, so ensureLoop would not
// run again on its own). App.tsx already swaps the drift/sway state on the
// same change; this restarts or freezes the clock to match.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (event) => {
    if (event.matches) {
      haltLoop();
      frame = engine.sample(clock);
      emit();
    } else if (subs.size > 0) {
      ensureLoop();
    }
  });
}

export function subscribeMascot(fn: () => void): () => void {
  subs.add(fn);
  ensureLoop();
  return () => {
    subs.delete(fn);
    if (subs.size === 0) haltLoop();
  };
}

export function getMascotFrame(): BotFrame {
  return frame;
}

function applyParams() {
  const next = roamParams ?? baseParams;
  if (next.state === appliedParams.state && next.expression === appliedParams.expression) return;
  appliedParams = next;
  engine.setState(next.state, clock);
  engine.setExpression(
    EXPRESSION_BY_ID.get(next.expression) ?? EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null,
    clock,
  );
  if (!running) {
    frame = engine.sample(clock);
    notifyFrameListeners();
    emit();
  }
}

export function pushMascotParams(params: MascotParams) {
  baseParams = params;
  applyParams();
}

/** Roaming temporarily overrides the app's state and expression, then hands the base state back. */
export function pushMascotRoamParams(params: MascotParams | null) {
  roamParams = params;
  if (!roamParams) engine.setLook(null, clock);
  applyParams();
}

export function pushMascotLook(look: Look | null) {
  engine.setLook(look, clock);
  if (!running) {
    frame = engine.sample(clock);
    notifyFrameListeners();
    emit();
  }
}

/** Frame side channel for transient DOM work. It reuses the one shared rAF loop. */
export function observeMascotFrame(listener: (frame: BotFrame, clock: number) => void): () => void {
  frameListeners.add(listener);
  listener(frame, clock);
  return () => frameListeners.delete(listener);
}

/** Pure re-read for tests and frozen previews: no clock advance, no emit. */
export function sampleMascotAt(t: number): BotFrame {
  return engine.sample(t);
}

function useMascotFrame(): BotFrame {
  return useSyncExternalStore(subscribeMascot, getMascotFrame);
}

/** Live figure permanently bound to the shared store. Ink/paper default to the dark app theme. */
export function LiveMascotFigure({
  size,
  ink = "#e5ddd2",
  paper = "transparent",
  className,
}: {
  size: number;
  ink?: string;
  paper?: string;
  className?: string;
}) {
  const liveFrame = useMascotFrame();
  return <MascotFigure frame={liveFrame} size={size} ink={ink} paper={paper} className={className} />;
}

/** Search-bar fit. Tight crop around the drift gaze so it sits centered in 50px. */
export function LiveMascotSearchEyes({
  size,
  ink = "#e5ddd2",
  className,
}: {
  size: number;
  ink?: string;
  className?: string;
}) {
  const liveFrame = useMascotFrame();
  return <MascotSearchEyes frame={liveFrame} size={size} ink={ink} className={className} />;
}
