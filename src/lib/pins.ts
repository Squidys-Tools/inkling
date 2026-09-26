// A pin is the existing `favorite` flag on an item. The rail shows a few of
// them above the library grid so the things the user cares about are the first
// thing they see when they open the library.

type PinnedItem = {
  id: string | number;
  favorite?: boolean;
};

type PinRailView = {
  activeView: string;
  activeSpaceId: string | null;
  query: string;
  hasSimilaritySource: boolean;
};

// The rail is a fixed strip, not a scroller, so a large pin set would mount
// hundreds of cards. The Top of mind view still lists every pin.
export const PIN_RAIL_LIMIT = 8;

// Keeps the order the library already hands us (most recently touched first),
// so the rail doubles as "what you reached for lately".
export function pinRailItems<T extends PinnedItem>(items: readonly T[], limit = PIN_RAIL_LIMIT) {
  const capped = Number.isFinite(limit) ? Math.max(0, limit) : PIN_RAIL_LIMIT;
  return items.filter((item) => item.favorite === true).slice(0, capped);
}

// The rail belongs to the plain library. Every other surface already answers
// its own question: the Top of mind view is the pins, Serendipity is a walk,
// a Space is a saved search, and search or similarity results belong to the
// query that produced them.
export function showsPinRail(view: PinRailView) {
  if (view.activeView !== "Everything") return false;
  if (view.activeSpaceId !== null) return false;
  if (view.hasSimilaritySource) return false;
  return view.query.trim() === "";
}
