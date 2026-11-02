/**
 * The masonry keeps measured heights by list position, which only holds while
 * the list grows at its end. Any other change (a Space reading again, items on
 * top, items leaving) would misplace cells and leave empty ones past the new
 * end, so it starts a fresh layout.
 */
export function extendsList(previous: readonly string[], next: readonly string[]) {
  if (next.length < previous.length) return false;
  for (let index = 0; index < previous.length; index += 1)
    if (previous[index] !== next[index]) return false;
  return true;
}

/** The layout generation for `next`: the same while the list only grows at its end. */
export function nextGeneration(
  state: { ids: readonly string[]; generation: number },
  next: readonly string[],
) {
  if (state.ids === next) return state;
  return {
    ids: next,
    generation: extendsList(state.ids, next) ? state.generation : state.generation + 1,
  };
}
