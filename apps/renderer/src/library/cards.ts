import type { CardScope, LibraryCard } from "@inkling/contracts";
import { libraryClient } from "./connection.ts";
import { errorMessage } from "./errors.ts";
import {
  dropScope,
  emptyIndex,
  failLoad,
  type IndexState,
  placeCards,
  receivePage,
  removeIds,
  startLoad,
  updateCards,
} from "./indexState.ts";
import { refreshJobs } from "./jobs.ts";
import { activeScope, archivedScope, scopeKey } from "./scope.ts";
import { spacesStore } from "./spaces.ts";
import { createStore, useStore } from "./store.ts";

const pageSize = 100;
const active = scopeKey(activeScope);
const archived = scopeKey(archivedScope);
// The scopes the library pages by its order; a card belongs to one by its `archived` flag.
const paged = [active, archived];
const home = (card: LibraryCard) => (card.archived ? archived : active);

const libraryIndex = createStore<IndexState>(emptyIndex);
/** The scope the grid shows, which the library reloads when its membership may have moved. */
export const shownScope = createStore<CardScope>(activeScope);

let requests = 0;

export async function loadScope(scope: CardScope, mode: "first" | "more" = "first") {
  const key = scopeKey(scope);
  const request = ++requests;
  const started = startLoad(libraryIndex.get(), key, mode, request);
  if (!started) return;
  libraryIndex.set(started);
  try {
    const client = await libraryClient();
    const cursor = mode === "more" ? (started.scopes.get(key)?.next ?? null) : null;
    const page = await client.cards({ scope, cursor, limit: pageSize });
    libraryIndex.set((state) => receivePage(state, key, request, page));
    void refreshJobs(page.cards.map((card) => card.id));
  } catch (error) {
    libraryIndex.set((state) => failLoad(state, key, request, errorMessage(error)));
  }
}

export function ensureScope(scope: CardScope) {
  if (!libraryIndex.get().scopes.has(scopeKey(scope))) void loadScope(scope);
}

/** Puts cards the window just wrote at the top of the library, before the change event lands. */
export function showNewCards(cards: readonly LibraryCard[]) {
  libraryIndex.set((state) => placeCards(state, cards, paged, home));
}

/** Cards read outside a scope's pages, such as search results; an older copy never replaces a newer one. */
export function storeCards(cards: readonly LibraryCard[]) {
  libraryIndex.set((state) => updateCards(state, cards, true));
}

/**
 * Applies the library's answer for items it said changed. Archived items come
 * back too, so a card moves between the library and the archive in place; an
 * id missing from `cards` was deleted. Returns the ids that left the library.
 */
export function reconcileItems(ids: readonly string[], cards: readonly LibraryCard[]) {
  const found = new Set(cards.map((card) => card.id));
  const deleted = ids.filter((id) => !found.has(id));
  const archivedIds = cards.filter((card) => card.archived).map((card) => card.id);
  let next = placeCards(libraryIndex.get(), cards, paged, home);
  next = removeIds(next, deleted, "everywhere");
  // Spaces hold active items only.
  next = removeIds(
    next,
    archivedIds,
    [...next.scopes.keys()].filter((key) => !paged.includes(key)),
  );
  libraryIndex.set(next);
  return [...deleted, ...archivedIds];
}

export function removeItems(ids: readonly string[]) {
  libraryIndex.set((state) => removeIds(state, ids, "everywhere"));
}

export type SpaceScopeChange = "stale" | "gone" | null;

/**
 * Space membership is the library's to compute, so a Space whose membership
 * may have moved reads again: the shown one now, the others when next shown.
 * A Space that no longer exists is forgotten rather than read into an error.
 */
export function reloadSpaceScopes(change: (spaceId: string) => SpaceScopeChange) {
  const shown = scopeKey(shownScope.get());
  for (const key of libraryIndex.get().scopes.keys()) {
    if (!key.startsWith("space:")) continue;
    const verdict = change(key.slice("space:".length));
    if (!verdict) continue;
    if (key === shown && verdict === "stale") void loadScope(shownScope.get());
    else libraryIndex.set((state) => dropScope(state, key));
  }
}

/**
 * The grid shows `next`. A Space runs its query each time it is opened, so
 * a Smart Space is evaluated on open rather than on every change.
 */
export function showScope(next: CardScope) {
  const previous = scopeKey(shownScope.get());
  shownScope.set(next);
  if (next._tag === "Space" && previous !== scopeKey(next)) void loadScope(next);
  else ensureScope(next);
}

/** After a write this window made, the shown Smart Space asks the library again. */
export function reevaluateShownSpace() {
  const shown = shownScope.get();
  if (shown._tag !== "Space") return;
  const space = spacesStore.get().spaces.find((candidate) => candidate.id === shown.spaceId);
  if (space?.kind !== "regular" && libraryIndex.get().scopes.has(scopeKey(shown)))
    void loadScope(shown);
}

/** After the library process restarts, every scope the window holds reads again. */
export function reloadAll() {
  const shown = shownScope.get();
  for (const key of libraryIndex.get().scopes.keys())
    if (key !== active && key !== scopeKey(shown))
      libraryIndex.set((state) => dropScope(state, key));
  void loadScope(activeScope);
  if (scopeKey(shown) !== active) void loadScope(shown);
}

export const useScope = (scope: CardScope) => {
  const key = scopeKey(scope);
  return useStore(libraryIndex, (state) => state.scopes.get(key));
};
export const useCard = (id: string) => useStore(libraryIndex, (state) => state.cards.get(id));
export const useActiveTotal = () =>
  useStore(libraryIndex, (state) => state.scopes.get(active)?.total);
