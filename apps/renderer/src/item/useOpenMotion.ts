import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffectEvent, useLayoutEffect, useRef } from "react";
import {
  beatTiming,
  clipInset,
  contains,
  cornerRadii,
  coverSize,
  detailsShift,
  type FlightBeat,
  type FlightBeats,
  flightBeats,
  flightDuration,
  flightEase,
  type FlightRect,
  mediaFrames,
  mediaRadius,
  panelOffset,
  scrimOpacity,
  settledMedia,
  stageRegion,
} from "./flightGeometry.ts";
import { cardOrigin, type FlightOrigin, setFlightPainting, takeItemOrigin } from "./itemFlight.ts";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fadeDuration = 180;

/**
 * One animated layer: its pose on the card, its settled pose, any steps between them, and the
 * beat of the flight it moves on. Without a beat it runs the whole flight on the main curve.
 */
type Part = {
  element: HTMLElement;
  beat?: FlightBeat;
  closed: Keyframe;
  open: Keyframe;
  frames?: Keyframe[];
};
type Flight = {
  animations: Animation[];
  parts: Part[];
  /** The animation that ends last, and the length of the clock it runs on. */
  lead: Animation | null;
  total: number;
  /** Hides the card's own image while its clone is out. */
  cover: Animation | null;
  clone: HTMLImageElement | null;
  frame: number;
  pending: Promise<void> | null;
  resolve: (() => void) | null;
};
const idle = (): Flight => ({
  animations: [],
  parts: [],
  lead: null,
  total: 0,
  cover: null,
  clone: null,
  frame: 0,
  pending: null,
  resolve: null,
});

const fadePart = (view: HTMLElement): Part => ({
  element: view,
  closed: { transform: "scale(0.96)", opacity: 0 },
  open: { transform: "none", opacity: 1 },
});

function contentBox(element: HTMLElement): FlightRect {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const edge = (side: "Left" | "Right" | "Top" | "Bottom") =>
    (Number.parseFloat(style[`border${side}Width`]) || 0) +
    (Number.parseFloat(style[`padding${side}`]) || 0);
  return {
    left: box.left + edge("Left"),
    top: box.top + edge("Top"),
    width: box.width - edge("Left") - edge("Right"),
    height: box.height - edge("Top") - edge("Bottom"),
  };
}

/** Where the stage's image rests: predicted while opening, since the item may not be loaded yet. */
function mediaTarget(
  content: HTMLElement,
  media: NonNullable<FlightOrigin["media"]>,
  opening: boolean,
) {
  const stage = contentBox(content);
  if (stage.width <= 0 || stage.height <= 0) return null;
  if (opening)
    return settledMedia(
      media.mode,
      { width: media.image.naturalWidth, height: media.image.naturalHeight },
      stage,
    );
  const box = content.querySelector("[data-flight='media']")?.getBoundingClientRect();
  // A zoomed image overflows the stage and has no pose a card could fly to.
  return box && box.width > 0 && contains(content.getBoundingClientRect(), box) ? box : null;
}

/** Measures the view at rest and lays out every layer of the flight. */
function buildParts(view: HTMLElement, origin: FlightOrigin, opening: boolean, state: Flight) {
  const layer = (name: string) => view.querySelector<HTMLElement>(`[data-flight="${name}"]`);
  const backdrop = layer("backdrop");
  const scrim = layer("scrim");
  const cell = layer("cell");
  const ground = layer("ground");
  const content = layer("content");
  const panel = layer("panel");
  const details = layer("details");
  const shadow = layer("shadow");
  const clone = view.querySelector<HTMLImageElement>("img[data-flight='clone']");
  if (!backdrop || !scrim || !cell || !ground || !content || !panel || !details || !shadow)
    return [fadePart(view)];

  const frame = view.getBoundingClientRect();
  const panelBox = panel.getBoundingClientRect();
  const below = panelBox.left - frame.left < 1;
  const region = stageRegion(frame, panelBox, below);
  const clip = (element: HTMLElement): Part => {
    const box = element.getBoundingClientRect();
    return {
      element,
      beat: "window",
      closed: { clipPath: clipInset(origin.card, box, origin.radius) },
      open: { clipPath: clipInset(region, box, 0) },
    };
  };
  const fade = (element: HTMLElement, beat: FlightBeat, opacity = 1): Part => ({
    element,
    beat,
    closed: { opacity: 0 },
    open: { opacity },
  });
  const parts: Part[] = [
    clip(backdrop),
    fade(backdrop, "frame"),
    fade(scrim, "scrim", scrimOpacity),
    clip(cell),
    fade(ground, "ground"),
    {
      element: panel,
      beat: "panel",
      closed: { transform: panelOffset(panelBox, below) },
      open: { transform: "none" },
    },
    {
      element: shadow,
      beat: "panel",
      closed: { opacity: 0 },
      open: { opacity: 0 },
      frames: [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }],
    },
    fade(details, "details"),
    {
      element: details,
      beat: "shift",
      closed: { transform: `translate${below ? "Y" : "X"}(${detailsShift}px)` },
      open: { transform: "none" },
    },
  ];

  const target = clone && origin.media ? mediaTarget(content, origin.media, opening) : null;
  if (!clone || !origin.media || !target) {
    // No image to fly: the content waits for the frame to open, then arrives with the details.
    // Sooner, the growing clip would show an arbitrary slice of it.
    parts.push(fade(content, "details"), {
      element: content,
      beat: "shift",
      closed: { transform: "scale(0.96)" },
      open: { transform: "scale(1)" },
    });
    return parts;
  }

  const { image, mode, rect } = origin.media;
  const size = coverSize({ width: image.naturalWidth, height: image.naturalHeight }, target);
  const settled = mediaRadius[mode];
  const frames = mediaFrames(
    size,
    { box: rect, radii: cornerRadii(rect, origin.card, origin.radius) },
    { box: target, radii: [settled, settled, settled, settled] },
    frame,
  );
  const [closed, open] = [frames[0], frames.at(-1)];
  if (!closed || !open) return parts;
  clone.src = image.currentSrc || image.src;
  clone.style.width = `${size.width}px`;
  clone.style.height = `${size.height}px`;
  clone.hidden = false;
  state.clone = clone;
  // The stage's own content shows under the landed clone, which then fades off it, so the
  // stage's controls arrive with the image instead of popping in after it.
  parts.push(
    { element: content, beat: "reveal", closed: { opacity: 0 }, open: { opacity: 1 } },
    { element: clone, beat: "handoff", closed: { opacity: 1 }, open: { opacity: 0 } },
    { element: clone, beat: "media", closed, open, frames },
  );
  // The card keeps its image until the clone can paint, so neither end shows a blank frame.
  void clone.decode().then(
    () => {
      if (state.clone === clone && !clone.hidden && !state.cover)
        state.cover = image.animate([{ opacity: 0 }, { opacity: 0 }], {
          duration: 1,
          fill: "both",
        });
    },
    () => undefined,
  );
  return parts;
}

const endOf = (animation: Animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0);

/** Plays every part on one clock: on its beat when given the beats, otherwise all together. */
function play(
  state: Flight,
  frames: (part: Part) => Keyframe[],
  duration: number,
  beats?: FlightBeats,
) {
  state.animations = state.parts.map((part) =>
    part.element.animate(
      frames(part),
      part.beat && beats
        ? beatTiming(beats[part.beat], duration)
        : { duration, easing: flightEase, fill: "both" },
    ),
  );
  state.total = duration;
  state.lead = state.animations.reduce<Animation | null>(
    (last, animation) => (last && endOf(last) > endOf(animation) ? last : animation),
    null,
  );
  return state.lead;
}

function settle(state: Flight) {
  for (const animation of state.animations) animation.cancel();
  state.cover?.cancel();
  if (state.clone) state.clone.hidden = true;
  state.animations = [];
  state.parts = [];
  state.lead = null;
  state.cover = null;
  state.clone = null;
  setFlightPainting(false);
}

const cssName = (key: string) => (key === "clipPath" ? "clip-path" : key);

/**
 * Opens from the card on one clock: the library recedes, the frame is revealed through a
 * growing clip, the card's image flies to the stage and the details slide in from the edge
 * behind it. Back, Close and Escape share the shorter flight home, and wait for it before
 * routing away.
 */
export function useOpenMotion(id: string, viewRef: RefObject<HTMLElement | null>) {
  const active = useRef<Flight>(idle());
  const open = useEffectEvent((itemId: string) => {
    const view = viewRef.current;
    const origin = takeItemOrigin(itemId);
    if (!view || reduced()) return;
    const state = active.current;
    setFlightPainting(true);
    state.parts = origin ? buildParts(view, origin, true, state) : [fadePart(view)];
    const lead = play(
      state,
      (part) => part.frames ?? [part.closed, part.open],
      origin ? flightDuration.open : fadeDuration,
      flightBeats.open,
    );
    if (!lead) return settle(state);
    lead.onfinish = () => {
      if (state.lead === lead) settle(state);
    };
  });
  useLayoutEffect(() => {
    const state = idle();
    active.current = state;
    open(id);
    return () => {
      cancelAnimationFrame(state.frame);
      settle(state);
      state.resolve?.();
    };
  }, [id]);

  const close = useCallback(() => {
    const state = active.current;
    const view = viewRef.current;
    if (state.pending) return state.pending;
    if (!view || reduced()) {
      settle(state);
      return Promise.resolve();
    }
    state.pending = new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
    const land = (lead: Animation | null) => {
      if (!lead) return state.resolve?.();
      lead.onfinish = () => {
        if (state.lead === lead) state.resolve?.();
      };
    };

    const opening = state.lead;
    if (opening) {
      // Closing can interrupt opening: every layer turns around together from the pose it is in.
      const progress = Math.min(1, Number(opening.currentTime ?? state.total) / state.total);
      const fade = state.parts.length === 1;
      const poses = state.parts.map((part) => {
        const style = getComputedStyle(part.element);
        return Object.fromEntries(
          Object.keys(part.closed).map((key) => [key, style.getPropertyValue(cssName(key))]),
        );
      });
      for (const animation of state.animations) animation.cancel();
      const from = new Map(state.parts.map((part, index) => [part, poses[index]]));
      land(
        play(
          state,
          (part) => [from.get(part) ?? part.open, part.closed],
          fade ? fadeDuration : Math.max(fadeDuration, flightDuration.close * progress),
        ),
      );
      return state.pending;
    }

    // The library under the view is skipped by paint; its cards have rects a frame after it is not.
    setFlightPainting(true);
    state.frame = requestAnimationFrame(() => {
      const target = cardOrigin(id);
      state.parts = target ? buildParts(view, target, false, state) : [fadePart(view)];
      land(
        play(
          state,
          (part) => (part.frames ?? [part.closed, part.open]).toReversed(),
          target ? flightDuration.close : fadeDuration,
          flightBeats.close,
        ),
      );
    });
    return state.pending;
  }, [id, viewRef]);
  const shouldBlockFn = useCallback<ShouldBlockFn>(
    async ({ current, next }) => {
      if (current.pathname !== next.pathname) await close();
      return false;
    },
    [close],
  );
  // No unload prompt: this only delays internal routing until the exit animation lands.
  useBlocker({ shouldBlockFn, enableBeforeUnload: false });
}
