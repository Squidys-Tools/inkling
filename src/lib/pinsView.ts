type PinsViewItem = {
  favorite?: boolean;
};

type PinsViewOptions = {
  // The pins view is the whole library narrowed to pinned items. A query can
  // still narrow it, and then an empty result is a search miss rather than an
  // empty shelf.
  query?: string;
};

/**
 * Whether an empty grid in the pins view means "nothing is pinned", as opposed
 * to "the active search matched none of the pins".
 */
export function isEmptyPinsView(options: PinsViewOptions = {}) {
  return !options.query?.trim();
}

/**
 * Whether an item belongs in the pins view. A pin is the item's `favorite`
 * flag; the query narrowing is applied by the caller's list.
 */
export function matchesPinsView(item: PinsViewItem) {
  return item.favorite === true;
}
