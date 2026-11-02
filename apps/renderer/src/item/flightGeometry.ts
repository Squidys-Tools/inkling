export type FlightRect = { left: number; top: number; width: number; height: number };
export const flightDuration = 510;

/** Only fly to a card when at least three quarters of each axis is visible. */
export function usableOrigin(card: FlightRect, viewport: FlightRect) {
  if (card.width <= 0 || card.height <= 0) return false;
  const width = Math.max(
    0,
    Math.min(card.left + card.width, viewport.left + viewport.width) -
      Math.max(card.left, viewport.left),
  );
  const height = Math.max(
    0,
    Math.min(card.top + card.height, viewport.top + viewport.height) -
      Math.max(card.top, viewport.top),
  );
  return width / card.width >= 0.75 && height / card.height >= 0.75;
}

/** Maps the settled item frame onto a captured card, with a top-left transform origin. */
export function originTransform(card: FlightRect, view: FlightRect) {
  if (view.width <= 0 || view.height <= 0) return "none";
  return `translate(${card.left - view.left}px, ${card.top - view.top}px) scale(${card.width / view.width}, ${card.height / view.height})`;
}
