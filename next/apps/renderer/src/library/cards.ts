import type { CardScope, LibraryCard } from "@inkling/contracts";
import { libraryClient } from "./connection.ts";
import { errorMessage } from "./errors.ts";
import {
  dropScope,
  emptyIndex,
  failLoad,
  type IndexState,
  prependCards,
  receivePage,
  removeIds,
  scopeHas,
  startLoad,
  updateCards,
} from "./indexState.ts";
import { refreshJobs } from "./jobs.ts";
import { activeScope, archivedScope, scopeKey } from "./scope.ts";
import { createStore, useStore } from "./store.ts";

const pageSize = 100;
const active = scopeKey(activeScope);
const archived = scopeKey(archivedScope);

export const libraryIndex = createStore<IndexState>(emptyIndex);
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
  libraryIndex.set((state) => prependCards(state, cards, [active]));
}

export function storeCards(cards: readonly LibraryCard[]) {
  libraryIndex.set((state) => updateCards(state, cards));
}

/**
 * Applies the library's answer for items it said changed. `cards` holds only
 * active items, so a requested id missing from it was archived or deleted.
 */
export function reconcileItems(ids: readonly string[], cards: readonly LibraryCard[]) {
  const state = libraryIndex.get();
  const found = new Set(cards.map((card) => card.id));
  const gone = ids.filter((id) => !found.has(id));
  const arrived = cards.filter((card) => !scopeHas(state, active, card.id));
  let next = updateCards(state, cards);
  next = prependCards(next, arrived, [active]);
  next = removeIds(next, [...found], [archived]);
  next = removeIds(
    next,
    gone,
    [...next.scopes.keys()].filter((key) => key !== archived),
  );
  libraryIndex.set(next);
  if (gone.length > 0 && next.scopes.has(archived)) void loadScope(archivedScope);
  return gone;
}

export function removeItems(ids: readonly string[]) {
  libraryIndex.set((state) => removeIds(state, ids, "everywhere"));
}

/** Space membership is the library's to compute, so Space scopes read again rather than patch. */
export function reloadSpaceScopes() {
  const shown = shownScope.get();
  for (const key of libraryIndex.get().scopes.keys()) {
    if (!key.startsWith("space:")) continue;
    if (key === scopeKey(shown)) void loadScope(shown);
    else libraryIndex.set((state) => dropScope(state, key));
  }
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

export const isKnownCard = (id: string) => libraryIndex.get().cards.has(id);

export const useScope = (scope: CardScope) => {
  const key = scopeKey(scope);
  return useStore(libraryIndex, (state) => state.scopes.get(key));
};
export const useCard = (id: string) => useStore(libraryIndex, (state) => state.cards.get(id));
export const useActiveTotal = () =>
  useStore(libraryIndex, (state) => state.scopes.get(active)?.total);
