import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Look } from "./bot/engine";
import {
  createRoamState,
  findRoamSpots,
  forceRoamStart,
  isRoamPositionSafe,
  nearestRoamSpot,
  roamOpacity,
  roamPosition,
  roamTick,
  seededRoamRandom,
  type RoamContext,
  type RoamPoint,
  type RoamRect,
  type RoamSpot,
  type RoamState,
} from "./mascotRoam";
import {
  LiveMascotFigure,
  observeMascotFrame,
  pushMascotLook,
  pushMascotRoamParams,
} from "./mascotStore";

const MASCOT_SIZE = 44;
const LAYOUT_THROTTLE_MS = 120;
const LAYOUT_REFRESH_MS = 1_000;
const ACTIVITY_LOOK_MS = 1_600;

export interface MascotRoamerProps {
  mainRef: RefObject<HTMLElement | null>;
  blocked: boolean;
  captureFailed: boolean;
  reducedMotion: boolean;
  onPresenceChange: (away: boolean) => void;
  dev?: boolean;
}

interface MeasuredLayout {
  frame: RoamRect;
  content: RoamRect;
  obstacles: RoamRect[];
  spots: RoamSpot[];
  lookPoints: RoamPoint[];
}

interface Activity {
  point: RoamPoint | null;
  until: number;
}

function rectOf(element: Element): RoamRect {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function contentElementFor(main: HTMLElement): Element {
  return main.querySelector(".library-grid") ?? main.querySelector(".library-scroll") ?? main;
}

function measureLayout(main: HTMLElement): MeasuredLayout {
  const frame = rectOf(main);
  const cards = Array.from(main.querySelectorAll(".library-card"))
    .map(rectOf)
    .filter((card) => card.width > 0 && card.height > 0
      && card.x < frame.x + frame.width
      && card.x + card.width > frame.x
      && card.y < frame.y + frame.height
      && card.y + card.height > frame.y);
  const obstacles = [
    ...cards,
    ...Array.from(main.querySelectorAll(".capture-bar, .library-toolbar")).map(rectOf),
    ...Array.from(document.querySelectorAll("[data-sonner-toast]")).map(rectOf),
  ];
  const contentElement = contentElementFor(main);
  const content = rectOf(contentElement);
  return {
    frame,
    content,
    obstacles,
    spots: findRoamSpots({ frame, content, obstacles, mascotSize: MASCOT_SIZE }),
    lookPoints: cards.map((card) => ({ x: card.x + card.width / 2, y: card.y + card.height / 2 })),
  };
}

function lookTarget(state: RoamState, activity: Activity, now: number): RoamPoint | null {
  if (activity.point && activity.until >= now) return activity.point;
  if (state.lookPoint) return state.lookPoint;
  if (!state.travel || state.travel.route.length === 0) return null;
  const position = roamPosition(state);
  return state.travel.route.find((point) => Math.hypot(point.x - position.x, point.y - position.y) > 2) ?? null;
}

function lookToward(position: RoamPoint, target: RoamPoint): Look {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  return {
    yaw: Math.max(-28, Math.min(28, dx / 14)),
    pitch: Math.max(-18, Math.min(18, dy / 18)),
    mix: 0.82,
    spin: 0,
    wander: 0.22,
  };
}

function devSeed(): number {
  if (typeof window === "undefined") return 1;
  const raw = new URLSearchParams(window.location.search).get("mascot-roam");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2026;
}

export function MascotRoamer({
  mainRef,
  blocked,
  captureFailed,
  reducedMotion,
  onPresenceChange,
  dev = false,
}: MascotRoamerProps) {
  const [seed, setSeed] = useState(devSeed);
  const randomRef = useRef<() => number>(dev ? seededRoamRandom(seed) : Math.random);
  const [initial] = useState(() => createRoamState(performance.now(), randomRef.current));
  const stateRef = useRef<RoamState>(initial);
  const [present, setPresent] = useState(false);
  const [devView, setDevView] = useState({ action: initial.action, expression: initial.expression, stopCount: 0 });
  const hostRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<{ dirty: boolean; changed: boolean; measuredAt: number; value: MeasuredLayout }>({
    dirty: true,
    changed: false,
    measuredAt: 0,
    value: { frame: { x: 0, y: 0, width: 0, height: 0 }, content: { x: 0, y: 0, width: 0, height: 0 }, obstacles: [], spots: [], lookPoints: [] },
  });
  const activityRef = useRef<Activity>({ point: null, until: 0 });
  const contentElementRef = useRef<Element | null>(null);
  const presenceRef = useRef(false);
  const engineKeyRef = useRef("");
  const lastDevViewRef = useRef("");
  const propsRef = useRef({ blocked, captureFailed, reducedMotion });
  propsRef.current = { blocked, captureFailed, reducedMotion };

  const context = useCallback((now: number): RoamContext => {
    const main = mainRef.current;
    const layout = layoutRef.current;
    const elapsed = now - layout.measuredAt;
    const shouldMeasure = layout.measuredAt === 0
      || (layout.dirty && elapsed >= LAYOUT_THROTTLE_MS)
      || (!layout.dirty && elapsed >= LAYOUT_REFRESH_MS);
    if (main && shouldMeasure) {
      layout.value = measureLayout(main);
      contentElementRef.current = contentElementFor(main);
      layout.dirty = false;
      layout.changed = true;
      layout.measuredAt = now;
    }
    return {
      blocked: propsRef.current.blocked,
      captureFailed: propsRef.current.captureFailed,
      reducedMotion: propsRef.current.reducedMotion,
      frame: layout.value.frame,
      content: layout.value.content,
      obstacles: layout.value.obstacles,
      spots: layout.value.spots,
      lookPoints: layout.value.lookPoints,
    };
  }, [mainRef]);

  const setPresence = useCallback((away: boolean) => {
    if (presenceRef.current === away) return;
    presenceRef.current = away;
    setPresent(away);
    onPresenceChange(away);
  }, [onPresenceChange]);

  const paint = useCallback((state: RoamState) => {
    const host = hostRef.current;
    if (!host) return;
    const position = roamPosition(state);
    const opacity = propsRef.current.blocked ? 0 : roamOpacity(state);
    host.style.transform = `translate3d(${position.x - MASCOT_SIZE / 2}px, ${position.y - MASCOT_SIZE / 2}px, 0)`;
    host.style.opacity = opacity.toFixed(3);
    host.classList.toggle("is-returning", state.phase === "returning");
  }, []);

  const syncEngine = useCallback((state: RoamState, now: number) => {
    const key = `${state.away}:${state.phase}:${state.expression}`;
    if (engineKeyRef.current === key) return;
    engineKeyRef.current = key;
    if (!state.away) {
      pushMascotRoamParams(null);
      pushMascotLook(null);
      return;
    }
    const travelling = state.phase === "travelling" || state.phase === "returning";
    pushMascotRoamParams({
      state: travelling ? "inkling-jelly" : "inkling-sway",
      expression: state.expression,
    });
    const target = lookTarget(state, activityRef.current, now);
    pushMascotLook(target ? lookToward(roamPosition(state), target) : null);
  }, []);

  const advance = useCallback((now: number) => {
    let state = stateRef.current;
    let ctx = context(now);
    state = roamTick(state, now, ctx, randomRef.current);
    const layoutChanged = layoutRef.current.changed;
    layoutRef.current.changed = false;
    let mustSnap = false;

    if (state.away) {
      const main = mainRef.current;
      const contentElement = contentElementRef.current ?? (main ? contentElementFor(main) : null);
      if (main && contentElement) {
        const liveContent = rectOf(contentElement);
        if (!isRoamPositionSafe(state, { ...ctx, content: liveContent, obstacles: [] }, MASCOT_SIZE)) {
          const live = measureLayout(main);
          layoutRef.current = { dirty: false, changed: false, measuredAt: now, value: live };
          contentElementRef.current = contentElementFor(main);
          ctx = {
            blocked: propsRef.current.blocked,
            captureFailed: propsRef.current.captureFailed,
            reducedMotion: propsRef.current.reducedMotion,
            frame: live.frame,
            content: live.content,
            obstacles: live.obstacles,
            spots: live.spots,
            lookPoints: live.lookPoints,
          };
          mustSnap = true;
        }
      }
      if (layoutChanged && !isRoamPositionSafe(state, ctx, MASCOT_SIZE)) mustSnap = true;
      if (ctx.spots.length < 2) mustSnap = true;
    }

    if (state.away && mustSnap) {
      const nearest = nearestRoamSpot(roamPosition(state), ctx.spots);
      state = nearest
        ? {
            ...state,
            position: nearest.point,
            spot: nearest,
            travel: null,
            phase: state.phase === "returning" ? "returning" : "observing",
            lookPoint: null,
            holdUntilMs: state.awakeSpentMs + 1200,
            lastNow: now,
          }
        : createRoamState(now, randomRef.current);
    }
    stateRef.current = state;
    setPresence(state.away);
    syncEngine(state, now);
    if (state.away) {
      const position = roamPosition(state);
      const target = lookTarget(state, activityRef.current, now);
      pushMascotLook(target ? lookToward(position, target) : null);
      paint(state);
    }
    if (dev) {
      const viewKey = `${state.action}:${state.expression}:${state.stopCount}`;
      if (viewKey !== lastDevViewRef.current) {
        lastDevViewRef.current = viewKey;
        setDevView({ action: state.action, expression: state.expression, stopCount: state.stopCount });
      }
    }
  }, [context, dev, mainRef, paint, setPresence, syncEngine]);

  useEffect(() => {
    const markLayoutDirty = () => {
      layoutRef.current.dirty = true;
    };
    const markActivity = (event: Event) => {
      const now = performance.now();
      const pointer = event instanceof PointerEvent || event instanceof WheelEvent
        ? { x: event.clientX, y: event.clientY }
        : null;
      activityRef.current = { point: pointer ?? activityRef.current.point, until: now + ACTIVITY_LOOK_MS };
    };
    const onVisibility = () => markLayoutDirty();

    window.addEventListener("resize", markLayoutDirty);
    window.addEventListener("scroll", markLayoutDirty, true);
    window.addEventListener("pointermove", markActivity, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("wheel", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    document.addEventListener("visibilitychange", onVisibility);

    const resizeObserver = typeof ResizeObserver === "function" && mainRef.current
      ? new ResizeObserver(markLayoutDirty)
      : null;
    if (resizeObserver && mainRef.current) resizeObserver.observe(mainRef.current);

    const stop = observeMascotFrame(() => advance(performance.now()));

    return () => {
      stop();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", markLayoutDirty);
      window.removeEventListener("scroll", markLayoutDirty, true);
      window.removeEventListener("pointermove", markActivity);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("wheel", markActivity);
      window.removeEventListener("keydown", markActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [advance, mainRef]);

  useLayoutEffect(() => {
    if (present) paint(stateRef.current);
  }, [paint, present]);

  useEffect(() => {
    paint(stateRef.current);
  }, [blocked, paint]);

  useEffect(() => {
    if (!reducedMotion && !captureFailed) return;
    if (!presenceRef.current) return;
    const now = performance.now();
    stateRef.current = createRoamState(now, randomRef.current);
    engineKeyRef.current = "";
    pushMascotRoamParams(null);
    pushMascotLook(null);
    setPresence(false);
  }, [captureFailed, reducedMotion, setPresence]);

  const forceOuting = () => {
    layoutRef.current.dirty = true;
    stateRef.current = forceRoamStart(stateRef.current, performance.now());
  };

  const skipTenSeconds = () => {
    let state = stateRef.current;
    let now = state.lastNow;
    for (let step = 0; step < 100; step += 1) {
      now += 100;
      state = roamTick(state, now, context(now), randomRef.current);
    }
    stateRef.current = { ...state, lastNow: performance.now() };
    setPresence(state.away);
    syncEngine(state, performance.now());
    if (state.away) paint(state);
  };

  const goHome = () => {
    const now = performance.now();
    stateRef.current = createRoamState(now, randomRef.current);
    engineKeyRef.current = "";
    pushMascotRoamParams(null);
    pushMascotLook(null);
    setPresence(false);
  };

  const reseed = () => {
    const next = seed + 1;
    setSeed(next);
    randomRef.current = seededRoamRandom(next);
  };

  return (
    <>
      {present && typeof document !== "undefined" && createPortal(
        <div ref={hostRef} className="mascot-roamer" aria-hidden="true">
          <LiveMascotFigure size={MASCOT_SIZE} />
        </div>,
        document.body,
      )}
      {dev && (
        <div className="mascot-roam-dev" role="status" aria-label="Mascot roam controls">
          <strong>Mascot roam</strong>
          <span>{devView.action} · {devView.expression} · {devView.stopCount} stops</span>
          <div>
            <button type="button" onClick={forceOuting}>Roam now</button>
            <button type="button" onClick={skipTenSeconds}>Skip 10s</button>
            <button type="button" onClick={reseed}>Reseed</button>
            <button type="button" onClick={goHome}>Home</button>
          </div>
        </div>
      )}
    </>
  );
}
