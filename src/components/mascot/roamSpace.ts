/**
 * Where the mascot can go, and what it can look at.
 *
 * It can go anywhere. The overlay is `pointer-events: none` and `aria-hidden`,
 * so it already cannot intercept a click, and the mascot is a 29px blot rather
 * than a panel. There is no obstacle list here and no lattice of candidate
 * spots, because there is nothing to avoid: the library is the room, and the
 * mascot moves through it.
 *
 * The one thing that still needs measuring is what it looks at, since a gaze
 * needs a real card in front of it.
 */

import type { Rand } from "./roam";
import type { Bounds, Vec } from "./drift";

export type { Bounds, Vec };

/** The one size the mascot is drawn at, in every slot and in the library. */
export const MASCOT_SIZE = 44;

/**
 * How far inside the library it stays. Enough that the blot never hangs off the
 * window edge or clips the title bar, which would read as broken rather than
 * as roaming.
 */
const ROAM_INSET = 30;

/** The area the mascot moves in, given the library panel's rectangle. */
export function roamBounds(panel: Bounds): Bounds {
  return {
    left: panel.left + ROAM_INSET,
    top: panel.top + ROAM_INSET,
    right: panel.right - ROAM_INSET,
    bottom: panel.bottom - ROAM_INSET,
  };
}

export type TargetPreference = "near" | "across" | "edge" | "any";

/**
 * A place to drift toward.
 *
 * The preferences shape where in the room it lands rather than filtering spots
 * out: `near` keeps it in the neighbourhood it is already in, `across` sends it
 * to the other half of the library, `edge` pulls it to the margins where a blot
 * reads against the chrome rather than over a photograph, and `any` is the
 * room at large. A preference that lands somewhere silly is not refused, because
 * refusing is what confined it to one margin before.
 */
export function pickTarget(
  bounds: Bounds,
  from: Vec,
  prefer: TargetPreference,
  rand: Rand,
): Vec {
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const roll = rand();

  if (prefer === "near") {
    // A short hop, any direction, measured in pixels rather than as a fraction
    // of the room. A fraction of the width and the height separately is not a
    // short hop in a wide window, it is most of the library.
    const angle = rand() * Math.PI * 2;
    const reach = 90 + rand() * 190;
    return clampTo(bounds, {
      x: from.x + Math.cos(angle) * reach,
      y: from.y + Math.sin(angle) * reach,
    });
  }

  if (prefer === "across") {
    // The far half, on either axis, whichever is cheaper to reach.
    const horizontal = (from.x - bounds.left) / width < 0.5;
    if (horizontal) {
      return { x: bounds.left + width * (0.62 + rand() * 0.33), y: lerp(bounds.top, bounds.bottom, rand()) };
    }
    return { x: lerp(bounds.left, bounds.right, rand()), y: bounds.top + height * (0.62 + rand() * 0.33) };
  }

  if (prefer === "edge") {
    // Somewhere along the margins. Blots read best against the flat chrome.
    const side = Math.floor(rand() * 4);
    if (side === 0) return { x: lerp(bounds.left, bounds.right, rand()), y: bounds.top };
    if (side === 1) return { x: lerp(bounds.left, bounds.right, rand()), y: bounds.bottom };
    if (side === 2) return { x: bounds.left, y: lerp(bounds.top, bounds.bottom, rand()) };
    return { x: bounds.right, y: lerp(bounds.top, bounds.bottom, rand()) };
  }

  // "any", and the fallback for a preference that wants something specific but
  // is landing somewhere unhelpful: the whole room, uniformly.
  void roll;
  return { x: lerp(bounds.left, bounds.right, rand()), y: lerp(bounds.top, bounds.bottom, rand()) };
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clampTo(bounds: Bounds, point: Vec): Vec {
  return {
    x: Math.min(Math.max(point.x, bounds.left), bounds.right),
    y: Math.min(Math.max(point.y, bounds.top), bounds.bottom),
  };
}

/**
 * Card centres worth looking at: what is on screen, nearest first. The mascot
 * looks at things it can see, so this is only ever called with measured,
 * currently visible rectangles.
 */
export function lookTargets(panel: Bounds, cards: Bounds[], from: Vec, limit = 6): Vec[] {
  return cards
    .filter((card) => {
      const x = (card.left + card.right) / 2;
      const y = (card.top + card.bottom) / 2;
      return x > panel.left && x < panel.right && y > panel.top && y < panel.bottom;
    })
    .map((card) => ({ x: (card.left + card.right) / 2, y: (card.top + card.bottom) / 2 }))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
    .slice(0, limit);
}

