import { createAtom, useSelector } from "@tanstack/react-store";
import { scrollToShow, usableOrigin, type FlightMedia, type FlightRect } from "./flightGeometry.ts";

const painting = createAtom(false);
export const setFlightPainting = (value: boolean) => painting.set(value);
export const useFlightPainting = () => useSelector(painting);

export const findCard = (id: string) =>
  document.querySelector<HTMLElement>(`[data-bench="card"][data-item-id="${CSS.escape(id)}"]`);

export type FlightOrigin = {
  card: FlightRect;
  radius: number;
  /** The card's own image, when the stage shows that same image. */
  media: { image: HTMLImageElement; mode: FlightMedia; rect: FlightRect } | null;
};

/** The grid a card scrolls in, and the part of it the search bar leaves showing. */
function shownArea(card: HTMLElement) {
  const scroller = card.closest<HTMLElement>("[data-bench='grid']");
  const viewport = scroller?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: innerWidth,
    height: innerHeight,
  };
  const toolbar = scroller
    ?.closest("section")
    ?.querySelector("input[type='search']")
    ?.getBoundingClientRect();
  const top = Math.max(viewport.top, toolbar?.bottom ?? viewport.top);
  return {
    scroller,
    visible: {
      left: viewport.left,
      top,
      width: viewport.width,
      height: Math.max(0, viewport.top + viewport.height - top),
    },
  };
}

/** The current visible card, excluding cards hidden under the search bar. */
export function cardOrigin(id: string): FlightOrigin | null {
  const card = findCard(id);
  if (!card) return null;
  const box = card.getBoundingClientRect();
  if (!usableOrigin(box, shownArea(card).visible)) return null;
  const host = card.querySelector<HTMLElement>("[data-flight]");
  const image = host instanceof HTMLImageElement ? host : host?.querySelector("img");
  const mode = host?.dataset.flight;
  return {
    card: box,
    radius: Number.parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0,
    media:
      image?.complete && image.naturalWidth > 0 && (mode === "fit" || mode === "poster")
        ? { image, mode, rect: image.getBoundingClientRect() }
        : null,
  };
}

const cardMargin = 24;

/** Scrolls a card cut off by the grid's edge fully into view, so it opens with the whole flight. */
function showWholeCard(id: string) {
  const card = findCard(id);
  if (!card || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const { scroller, visible } = shownArea(card);
  if (!scroller) return;
  const wanted = scrollToShow(card.getBoundingClientRect(), visible, cardMargin);
  const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  const by = Math.max(-scroller.scrollTop, Math.min(room, wanted));
  // Under a pixel the grid would not move, and `scrollend` would never fire.
  if (Math.abs(by) < 1) return;
  return new Promise<void>((resolve) => {
    scroller.addEventListener("scrollend", () => resolve(), { once: true });
    scroller.scrollBy({ top: by, behavior: "smooth" });
  });
}

let pending: { id: string; rect: FlightOrigin | null } | null = null;
let turn = 0;

/**
 * Snapshot before routing makes the underlying library inert and skips its paint. Resolves false
 * when another card was opened while this one scrolled into view.
 */
export async function prepareItemOpen(id: string) {
  const mine = ++turn;
  await showWholeCard(id);
  if (mine !== turn) return false;
  pending = { id, rect: cardOrigin(id) };
  return true;
}

export function takeItemOrigin(id: string) {
  const origin = pending?.id === id ? pending.rect : null;
  // Cleared after this task, not now: StrictMode runs the opening effect twice in development.
  queueMicrotask(() => {
    pending = null;
  });
  return origin;
}
