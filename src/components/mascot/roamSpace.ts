/**
 * Where the mascot can be.
 *
 * The rule is one line long: not over the cards. Everything else in the library
 * is fair ground - both margins, the band under the search bar, the header strip,
 * whatever is below the grid when the library is short. So there is no list of
 * things to avoid and nothing the geometry can refuse. The card grid is the only
 * exclusion, and it is expressed as a wall the mascot slides along rather than as
 * a filter on where it is allowed to stop.
 *
 * The room is the whole panel, and the grid is cut out of it. On a narrow layout
 * where the grid fills the panel there is barely anything left, and the mascot
 * then stays in its slot rather than squeezing into a gap it will not fit in.
 */

import type { Rand } from "./roam";
import { BODY_RADIUS, type Rect, type Terrain, type Vec } from "./drift";

export type { Rect, Terrain, Vec };

/**
 * How far inside the panel it stays. Only enough to keep the blot off the window
 * edge and out of the title bar drag region; every pixel of this is taken out of
 * the margins, which are only about as wide as the mascot is.
 */
const EDGE_INSET = 18;


/**
 * The room, and the things inside it the mascot must not be on.
 *
 * There are two kinds. The card grid is the user's content, and the strips of
 * controls above it are the things you aim at: a mascot drifting across the
 * search field or the Add button does not block the click, but it hides what you
 * were aiming at, which is the same problem wearing a hat. Everything else in the
 * panel is fair ground, and that is most of it.
 *
 * A blocker that is missing, collapsed or entirely outside the panel is dropped:
 * a wall outside the room is not a wall, and one that fills the room means there
 * is genuinely nowhere to be.
 */
export function terrainFor(panel: Rect, blockers: Array<Rect | null>): Terrain {
  const room: Rect = {
    left: panel.left + EDGE_INSET,
    top: panel.top + EDGE_INSET,
    right: panel.right - EDGE_INSET,
    bottom: panel.bottom - EDGE_INSET,
  };
  const walls: Rect[] = [];
  for (const raw of blockers) {
    if (!raw || raw.right <= raw.left || raw.bottom <= raw.top) continue;
    // Inflate by the body radius, so a centre that clears the wall clears the ink.
    // Clipped to the room afterwards, or a wall at the edge would push the mascot
    // back out of the room it is supposed to be inside.
    const grown: Rect = {
      left: Math.max(room.left, raw.left - BODY_RADIUS),
      top: Math.max(room.top, raw.top - BODY_RADIUS),
      right: Math.min(room.right, raw.right + BODY_RADIUS),
      bottom: Math.min(room.bottom, raw.bottom + BODY_RADIUS),
    };
    if (grown.right <= grown.left || grown.bottom <= grown.top) continue;
    walls.push(grown);
  }
  return { room, walls };
}

/** How much of the room is actually free, in square pixels. */
export function freeArea(terrain: Terrain): number {
  const { room, walls } = terrain;
  const total = Math.max(0, room.right - room.left) * Math.max(0, room.bottom - room.top);
  const blocked = walls.reduce((sum, w) => {
    const w2 = Math.max(0, w.right - w.left) * Math.max(0, w.bottom - w.top);
    return sum + Math.min(w2, total);
  }, 0);
  return Math.max(0, total - blocked);
}


/** Whether there is anywhere at all for the mascot to be. */
export function hasRoom(terrain: Terrain): boolean {
  const { room, walls } = terrain;
  if (room.right - room.left < 24 || room.bottom - room.top < 24) return false;
  // A wall that fills the room leaves nothing. Anything short of the whole room
  // still leaves a band somewhere, which the drift will find.
  return !walls.some((w) => w.right - w.left >= room.right - room.left && w.bottom - w.top >= room.bottom - room.top);
}

function inside(point: Vec, rect: Rect): boolean {
  return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

/**
 * A point in the free space, away from the walls. Used to place the mascot when
 * it appears somewhere new, so it never swells up in the middle of a photograph.
 *
 * Rejection sampling rather than arithmetic: with one wall and a room far larger
 * than it, a handful of tries is always enough, and the arithmetic version would
 * be a second piece of geometry to keep correct for no gain.
 */
export function freePoint(terrain: Terrain, rand: Rand, tries = 40): Vec | null {
  const { room, walls } = terrain;
  for (let i = 0; i < tries; i++) {
    const point = {
      x: room.left + rand() * (room.right - room.left),
      y: room.top + rand() * (room.bottom - room.top),
    };
    if (walls.every((wall) => !inside(point, wall))) return point;
  }
  // Every sample landed on the wall, which means the free space is very thin.
  // Fall back to a corner of the room rather than refusing to appear.
  return { x: room.left + 4, y: room.top + 4 };
}

/**
 * A point in a *different part* of the room from where the mascot is, so a hop
 * is a relocation rather than a shuffle. Biased away from the current spot rather
 * than uniformly random, because "somewhere else" that lands next door is not
 * somewhere else.
 */
export function farPoint(terrain: Terrain, from: Vec, rand: Rand, tries = 40): Vec | null {
  const width = terrain.room.right - terrain.room.left;
  const height = terrain.room.bottom - terrain.room.top;
  const far = Math.max(width, height) * 0.35;
  for (let i = 0; i < tries; i++) {
    const point = freePoint(terrain, rand, 8);
    if (!point) return null;
    if (Math.hypot(point.x - from.x, point.y - from.y) > far) return point;
  }
  // Nowhere far enough is not a nearby point: the caller keeps the current
  // leg, and a "relocation" that lands next door is a shuffle.
  return null;
}

/**
 * Card centres worth looking at: what is on screen, nearest first. The mascot
 * looks at things it can see, so this is only ever called with measured,
 * currently visible rectangles.
 */
export function lookTargets(panel: Rect, cards: Rect[], from: Vec, limit = 6): Vec[] {
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


