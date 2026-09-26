/**
 * Where the mascot may stand.
 *
 * A safe spot is free space, not a spot over something: the grid is full of
 * cards, the capture bar holds a search field, toasts float over the top, and
 * the mascot must not cover any of them. So this module is plain geometry over
 * rectangles, with no DOM, and the app hands it rectangles it measured.
 *
 * It answers two questions. "Where should I go for this action?" is a weighted
 * random pick among the roomy spots that suit the action, so no two walks follow
 * the same line. "Is where I am standing still valid?" is the nearest safe spot
 * to a point, which is what a resize or a scroll needs.
 */

import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import type { Rand } from "./roam";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** The one size the mascot is drawn at, in every slot. */
export const MASCOT_SIZE = 44;

/**
 * What actually has to fit, which is the ink and not the drawing box. The engine
 * paints the body on a sphere of RAYON inside a viewBox of DEMI_VIEWBOX, and the
 * splash peaks a shade past the radius, so the blot covers about 63% of the box
 * it is drawn in. A little is added back for the idle drift. Measuring against
 * the box instead would refuse every spot the library actually has.
 */
export const MASCOT_BODY = Math.ceil((2 * 1.06 * RAYON * MASCOT_SIZE) / (2 * DEMI_VIEWBOX) + 1);

/**
 * Spacing between candidate spots, fine enough to land inside a narrow gutter.
 * A very large window spreads the same step over far more ground, so the step
 * grows with the container: a search runs inside the mascot's own frame
 * callback, and the candidate budget is what keeps that frame cheap.
 */
const CANDIDATE_STEP = 18;
const MAX_CANDIDATES = 4_000;

/** A spot within reach of the current one, for a short shuffle. */
const NEAR_MIN = MASCOT_SIZE * 1.6;
const NEAR_MAX = MASCOT_SIZE * 6;

/** How far off the mid-line counts as the other side of the library. */
const ACROSS_FRACTION = 0.4;

/** Inside this distance of an edge counts as an outer margin. */
const MARGIN_BAND = MASCOT_SIZE * 2.2;

export type SpotPreference = "near" | "across" | "margin" | "any";

export interface SpotSearch {
  container: Rect;
  obstacles: Rect[];
  from: Point;
  prefer: SpotPreference;
  rand: Rand;
  size?: number;
  /** px of free space the mascot demands beyond "not touching" */
  minRoom?: number;
}

function centerOf(rect: Rect): Point {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

export function rectCenter(rect: Rect): Point {
  return centerOf(rect);
}

/**
 * Space around the mascot at `center`, in px. Negative means it does not fit:
 * it hangs over the edge of the container, or it touches something.
 *
 * This runs once per candidate per obstacle, a few thousand times a search, and
 * a search happens inside the mascot's own frame callback. So the inner loop
 * compares squared distances and takes one square root at the end.
 */
export function roomAt(center: Point, container: Rect, obstacles: Rect[], size = MASCOT_BODY): number {
  const half = size / 2;
  const left = center.x - half;
  const right = center.x + half;
  const top = center.y - half;
  const bottom = center.y + half;
  if (left < container.left || right > container.right || top < container.top || bottom > container.bottom) return -1;

  const edge = Math.min(left - container.left, top - container.top, container.right - right, container.bottom - bottom);
  let roomSq = edge * edge;
  for (const obstacle of obstacles) {
    const dx = Math.max(obstacle.left - right, left - obstacle.right);
    const dy = Math.max(obstacle.top - bottom, top - obstacle.bottom);
    if (dx <= 0 && dy <= 0) return -1;
    // Separated on one axis only means the gap is measured on the other.
    const gapSq = dx <= 0 ? dy * dy : dy <= 0 ? dx * dx : dx * dx + dy * dy;
    if (gapSq < roomSq) roomSq = gapSq;
  }
  return Math.sqrt(roomSq);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function edgeDistance(center: Point, container: Rect): number {
  return Math.min(center.x - container.left, center.y - container.top, container.right - center.x, container.bottom - center.y);
}

/**
 * Whether a candidate is even in the right part of the library for this action.
 * Cheap arithmetic on purpose: it runs for every candidate on the lattice, and
 * the expensive free-space test only runs for the ones that pass.
 */
function suits(center: Point, search: SpotSearch): boolean {
  const { prefer, from, container } = search;
  if (prefer === "any") return true;
  const dx = center.x - from.x;
  const dy = center.y - from.y;
  if (prefer === "near") {
    const sq = dx * dx + dy * dy;
    return sq >= NEAR_MIN * NEAR_MIN && sq <= NEAR_MAX * NEAR_MAX;
  }
  if (prefer === "across") {
    return Math.abs(dx) >= (container.right - container.left) * ACROSS_FRACTION;
  }
  return edgeDistance(center, container) <= MARGIN_BAND;
}

function candidates(search: SpotSearch, step = CANDIDATE_STEP): Array<{ center: Point; room: number }> {
  const { container, obstacles, rand, size = MASCOT_BODY, minRoom = 0 } = search;
  const half = size / 2;
  const left = container.left + half;
  const right = container.right - half;
  const top = container.top + half;
  const bottom = container.bottom - half;
  if (right < left || bottom < top) return [];

  const out: Array<{ center: Point; room: number }> = [];
  // Jitter the grid so repeated searches do not land on the same lattice. Less
  // than half a step of slack keeps the jitter from pushing a candidate out of a
  // lane it would otherwise have fitted in.
  const jitterX = (rand() * 2 - 1) * step * 0.4;
  const jitterY = (rand() * 2 - 1) * step * 0.4;
  for (let y = top + step / 2; y <= bottom; y += step) {
    for (let x = left + step / 2; x <= right; x += step) {
      const center = { x: x + jitterX, y: y + jitterY };
      // Order matters: the preference is arithmetic, the free-space test walks
      // every obstacle, and a narrow preference throws away most of the lattice.
      if (!suits(center, search)) continue;
      const room = roomAt(center, container, obstacles, size);
      if (room >= minRoom) out.push({ center, room });
    }
  }
  return out;
}

/**
 * Every way of standing somewhere, coarse lattice first.
 *
 * The margin beside the grid is about as wide as the mascot is, so a coarse grid
 * can step straight over it: a 48px band with 43px of usable room inside it holds
 * one valid centre in a five-pixel window, and whether a column lands in that
 * window is luck. A finer pass settles it. Refusing to walk should mean there is
 * genuinely nowhere to go, not that the grid missed.
 */
/** The lattice for this container, so the number of candidates stays bounded. */
function stepFor(container: Rect): number {
  const area = Math.max(0, container.right - container.left) * Math.max(0, container.bottom - container.top);
  return Math.max(CANDIDATE_STEP, Math.sqrt(area / MAX_CANDIDATES));
}

function pools(search: SpotSearch): Array<Array<{ center: Point; room: number }>> {
  const step = stepFor(search.container);
  const found = candidates(search, step);
  if (found.length > 0) return [found];
  const finer = candidates(search, step / 2);
  return finer.length > 0 ? [finer] : [];
}

/**
 * A spot for this action, or null when the library has nowhere to stand. Roomier
 * spots weigh more, which is what keeps the mascot in the margins and the wide
 * gutters instead of tucked against a card.
 */
export function findSafeSpot(search: SpotSearch): Point | null {
  const pool = pools(search).flat();
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, candidate) => sum + candidate.room + 4, 0);
  let roll = search.rand() * total;
  for (const candidate of pool) {
    roll -= candidate.room + 4;
    if (roll <= 0) return candidate.center;
  }
  return pool[pool.length - 1]!.center;
}

/** The closest spot that is still valid, for a resize or a scroll under the mascot. */
export function nearestSafeSpot(
  container: Rect,
  obstacles: Rect[],
  from: Point,
  size = MASCOT_BODY,
  minRoom = 0,
): Point | null {
  // Half a roll is an unjittered lattice, so a recovery lands somewhere
  // predictable instead of somewhere luck decides.
  const search: SpotSearch = { container, obstacles, from, prefer: "any", rand: () => 0.5, size, minRoom };
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (const candidate of pools(search).flat()) {
    const d = distance(candidate.center, from);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate.center;
    }
  }
  return best;
}

/** True when the mascot still fits where it stands. */
export function isSafeSpot(center: Point, container: Rect, obstacles: Rect[], size = MASCOT_BODY, minRoom = 0): boolean {
  return roomAt(center, container, obstacles, size) >= minRoom;
}

/**
 * Card centers worth looking at: what is on screen, nearest first. The mascot
 * looks at things it can see, so this is only ever called with measured,
 * currently visible rectangles.
 */
export function lookTargets(container: Rect, cards: Rect[], from: Point, limit = 6): Point[] {
  return cards
    .filter((card) => {
      const center = centerOf(card);
      return center.x > container.left && center.x < container.right && center.y > container.top && center.y < container.bottom;
    })
    .map(centerOf)
    .sort((a, b) => distance(a, from) - distance(b, from))
    .slice(0, limit);
}
