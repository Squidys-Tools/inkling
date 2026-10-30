import { useSyncExternalStore } from "react";
import { BotEngine } from "./bot/engine";
import { EXPRESSION_BY_ID, DEFAULT_EXPRESSION, type BotExpression } from "./bot/expressions";
import { SHAPE_BY_ID } from "./bot/skins";
import { RAYON } from "./bot/repere";
import type { StateId } from "./bot/states";
import { MascotFigure, MascotSearchEyes } from "./MascotFigure";

interface MascotParams {
  state: StateId;
  expression: BotExpression["id"];
}

/**
 * One engine shared by the live slots, so the mascot moves between them without
 * resetting its clock and 60fps frames re-render only subscribed figures. The loop
 * pauses when hidden or under reduced motion; without rAF (tests) pushes sample now.
 */
const engine = new BotEngine(
  RAYON,
  "inkling-drift",
  SHAPE_BY_ID.get("inkling-splash")?.radii ?? null,
  EXPRESSION_BY_ID.get(DEFAULT_EXPRESSION) ?? null,
);

let clock = 0;
let frame = engine.sample(0);
let raf = 0;
let lastMs = 0;
let running = false;
const subs = new Set<() => void>();
let appliedParams: MascotParams = { state: "inkling-drift", expression: DEFAULT_EXPRESSION };

const reducedMotion =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

export function prefersReducedMotion() {
  return reducedMotion?.matches ?? false;
}

function emit() {
  for (const fn of subs) fn();
}

function tick(ms: number) {
  raf = requestAnimationFrame(tick);
  const dt = lastMs ? Math.min((ms - lastMs) / 1000, 0.064) : 0;
  lastMs = ms;
  clock += dt;
  frame = engine.sample(clock);
  emit();
}

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

// Reduced motion can flip while the app is open, and subscribers stay mounted, so
// nothing else would restart or freeze the loop to match.
reducedMotion?.addEventListener("change", (event) => {
  if (event.matches) {
    haltLoop();
    frame = engine.sample(clock);
    emit();
  } else if (subs.size > 0) {
    ensureLoop();
  }
});

export function subscribeMascot(fn: () => void) {
  subs.add(fn);
  ensureLoop();
  return () => {
    subs.delete(fn);
    if (subs.size === 0) haltLoop();
  };
}

export function getMascotFrame() {
  return frame;
}

export function pushMascotParams({ state, expression }: MascotParams) {
  if (state === appliedParams.state && expression === appliedParams.expression) return;
  appliedParams = { state, expression };
  engine.setState(state, clock);
  engine.setExpression(EXPRESSION_BY_ID.get(expression) ?? null, clock);
  if (!running) {
    frame = engine.sample(clock);
    emit();
  }
}

function useMascotFrame() {
  return useSyncExternalStore(subscribeMascot, getMascotFrame);
}

/** Live figure permanently bound to the shared store, drawn for the dark app theme. */
export function LiveMascotFigure({ size }: { size: number }) {
  const liveFrame = useMascotFrame();
  return <MascotFigure frame={liveFrame} size={size} ink="var(--color-ink)" paper="transparent" />;
}

/** Search-bar fit. Tight crop around the drift gaze so it sits centered in 50px. */
export function LiveMascotSearchEyes({ size, className }: { size: number; className?: string }) {
  const liveFrame = useMascotFrame();
  return <MascotSearchEyes frame={liveFrame} size={size} className={className} />;
}
