import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router";
import { type RefObject, useCallback, useEffectEvent, useLayoutEffect, useRef } from "react";
import { flightDuration, originTransform } from "./flightGeometry.ts";
import { cardOrigin, setFlightPainting, takeItemOrigin } from "./itemFlight.ts";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = "cubic-bezier(0.85, 0, 0.15, 1)";
type Flight = {
  animation: Animation | null;
  frame: number;
  pending: Promise<void> | null;
  resolve: (() => void) | null;
};

/** Grows from the card and returns before routing away; Back, Close and Escape share the same flight. */
export function useOpenMotion(id: string, viewRef: RefObject<HTMLElement | null>) {
  const active = useRef<Flight>({ animation: null, frame: 0, pending: null, resolve: null });
  const open = useEffectEvent((itemId: string) => {
    const view = viewRef.current;
    const origin = takeItemOrigin(itemId);
    if (!view || reduced()) return;
    const state = active.current;
    setFlightPainting(true);
    view.style.transformOrigin = "0 0";
    const animation = view.animate(
      [
        {
          transform: origin ? originTransform(origin, view.getBoundingClientRect()) : "scale(0.96)",
          opacity: 0,
        },
        { transform: "none", opacity: 1 },
      ],
      { duration: origin ? flightDuration : 180, easing: ease, fill: "both" },
    );
    state.animation = animation;
    animation.onfinish = () => {
      if (state.animation !== animation) return;
      state.animation = null;
      animation.cancel();
      setFlightPainting(false);
    };
  });
  useLayoutEffect(() => {
    const state: Flight = { animation: null, frame: 0, pending: null, resolve: null };
    active.current = state;
    open(id);
    return () => {
      cancelAnimationFrame(state.frame);
      state.animation?.cancel();
      state.animation = null;
      state.resolve?.();
      setFlightPainting(false);
    };
  }, [id]);

  const close = useCallback(() => {
    const state = active.current;
    const view = viewRef.current;
    if (state.pending) return state.pending;
    if (!view || reduced()) {
      state.animation?.cancel();
      setFlightPainting(false);
      return Promise.resolve();
    }
    const style = getComputedStyle(view);
    const from = { transform: style.transform, opacity: style.opacity };
    // Closing can interrupt opening without jumping back to the settled pose.
    state.animation?.cancel();
    const hold = view.animate([from, from], { duration: 1, fill: "both" });
    state.animation = hold;
    state.pending = new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
    setFlightPainting(true);
    state.frame = requestAnimationFrame(() => {
      const target = cardOrigin(id);
      hold.cancel();
      const frame = view.getBoundingClientRect();
      const animation = view.animate(
        [from, { transform: target ? originTransform(target, frame) : "scale(0.96)", opacity: 0 }],
        { duration: target ? flightDuration : 180, easing: ease, fill: "both" },
      );
      state.animation = animation;
      animation.onfinish = () => {
        if (state.animation === animation) state.resolve?.();
      };
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
