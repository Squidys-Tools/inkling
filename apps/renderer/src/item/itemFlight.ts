import { createAtom, useSelector } from "@tanstack/react-store";
import { usableOrigin, type FlightMedia, type FlightRect } from "./flightGeometry.ts";

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

/** The current visible card, excluding cards hidden under the search bar. */
export function cardOrigin(id: string): FlightOrigin | null {
  const card = findCard(id);
  if (!card) return null;
  const box = card.getBoundingClientRect();
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
  const visible = {
    left: viewport.left,
    top,
    width: viewport.width,
    height: Math.max(0, viewport.top + viewport.height - top),
  };
  if (!usableOrigin(box, visible)) return null;
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

let pending: { id: string; rect: FlightOrigin | null } | null = null;

/** Snapshot before routing makes the underlying library inert and skips its paint. */
export function prepareItemOpen(id: string) {
  pending = { id, rect: cardOrigin(id) };
}

export function takeItemOrigin(id: string) {
  const origin = pending?.id === id ? pending.rect : null;
  // Cleared after this task, not now: StrictMode runs the opening effect twice in development.
  queueMicrotask(() => {
    pending = null;
  });
  return origin;
}
