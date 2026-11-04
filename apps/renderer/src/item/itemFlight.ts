import { createAtom, useSelector } from "@tanstack/react-store";
import { usableOrigin, type FlightRect } from "./flightGeometry.ts";

const painting = createAtom(false);
export const setFlightPainting = (value: boolean) => painting.set(value);
export const useFlightPainting = () => useSelector(painting);

export const findCard = (id: string) =>
  document.querySelector<HTMLElement>(`[data-bench="card"][data-item-id="${CSS.escape(id)}"]`);

/** The current visible card, excluding cards hidden under the search bar. */
export function cardOrigin(id: string): FlightRect | null {
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
  return usableOrigin(box, visible)
    ? { left: box.left, top: box.top, width: box.width, height: box.height }
    : null;
}

let pending: { id: string; rect: FlightRect | null } | null = null;

/** Snapshot before routing makes the underlying library inert and skips its paint. */
export function prepareItemOpen(id: string) {
  pending = { id, rect: cardOrigin(id) };
}

export function takeItemOrigin(id: string) {
  const origin = pending?.id === id ? pending.rect : null;
  pending = null;
  return origin;
}
