import type { CardPage, LibraryCard } from "@inkling/contracts";
import type { ScopeKey } from "./scope.ts";

export type ScopeState = {
  ids: readonly string[];
  next: string | null;
  total: number;
  status: "loading" | "ready" | "error";
  error: string | null;
  /** The request whose answer this scope waits for; older answers are dropped. */
  request: number;
  loading: "first" | "more" | null;
  // Changes that land while a request is in flight. Its answer was read before
  // them, so they are applied again on top of it.
  inserted: readonly string[];
  removed: ReadonlySet<string>;
};

export type IndexState = {
  cards: ReadonlyMap<string, LibraryCard>;
  scopes: ReadonlyMap<ScopeKey, ScopeState>;
};

export const emptyIndex: IndexState = { cards: new Map(), scopes: new Map() };

const noIds: readonly string[] = [];
const noRemovals: ReadonlySet<string> = new Set();

function withScope(state: IndexState, key: ScopeKey, scope: ScopeState): IndexState {
  const scopes = new Map(state.scopes);
  scopes.set(key, scope);
  return { ...state, scopes };
}

function withCards(cards: ReadonlyMap<string, LibraryCard>, incoming: readonly LibraryCard[]) {
  if (incoming.length === 0) return cards;
  const next = new Map(cards);
  for (const card of incoming) next.set(card.id, card);
  return next;
}

/** Starts reading a scope from its first page, or its next page after what it holds. */
export function startLoad(
  state: IndexState,
  key: ScopeKey,
  mode: "first" | "more",
  request: number,
): IndexState | null {
  const scope = state.scopes.get(key);
  if (mode === "more" && (!scope || scope.loading || scope.status !== "ready" || !scope.next))
    return null;
  return withScope(state, key, {
    ids: scope?.ids ?? noIds,
    next: scope?.next ?? null,
    total: scope?.total ?? 0,
    status: scope?.status === "ready" ? "ready" : "loading",
    error: null,
    request,
    loading: mode,
    inserted: noIds,
    removed: noRemovals,
  });
}

export function receivePage(
  state: IndexState,
  key: ScopeKey,
  request: number,
  page: CardPage,
): IndexState {
  const scope = state.scopes.get(key);
  if (!scope || scope.request !== request || !scope.loading) return state;
  const pageIds = page.cards.map((card) => card.id).filter((id) => !scope.removed.has(id));
  const dropped = page.cards.length - pageIds.length;
  let ids: string[];
  let total: number;
  if (scope.loading === "first") {
    const fresh = scope.inserted.filter((id) => !pageIds.includes(id));
    ids = [...fresh, ...pageIds];
    total = page.total - dropped + fresh.length;
  } else {
    const known = new Set(scope.ids);
    ids = [...scope.ids, ...pageIds.filter((id) => !known.has(id))];
    total = Math.max(page.total - dropped, ids.length);
  }
  return {
    cards: withCards(state.cards, page.cards),
    scopes: new Map(state.scopes).set(key, {
      ids,
      next: page.next,
      total,
      status: "ready",
      error: null,
      request,
      loading: null,
      inserted: noIds,
      removed: noRemovals,
    }),
  };
}

export function failLoad(
  state: IndexState,
  key: ScopeKey,
  request: number,
  message: string,
): IndexState {
  const scope = state.scopes.get(key);
  if (!scope || scope.request !== request) return state;
  // A failed next page keeps what is shown; a failed first page shows the error.
  return withScope(state, key, {
    ...scope,
    loading: null,
    status: scope.loading === "more" && scope.status === "ready" ? "ready" : "error",
    error: message,
  });
}

/** Replaces cards the library sent again; their place in each scope stays. */
export function updateCards(state: IndexState, cards: readonly LibraryCard[]): IndexState {
  if (cards.length === 0) return state;
  return { ...state, cards: withCards(state.cards, cards) };
}

/** Puts new cards at the top of the scopes that should show them, newest first. */
export function prependCards(
  state: IndexState,
  cards: readonly LibraryCard[],
  keys: readonly ScopeKey[],
): IndexState {
  let next = updateCards(state, cards);
  for (const key of keys) {
    const scope = next.scopes.get(key);
    if (!scope) continue;
    const present = new Set(scope.ids);
    const fresh = cards.map((card) => card.id).filter((id) => !present.has(id));
    if (fresh.length === 0) continue;
    next = withScope(next, key, {
      ...scope,
      ids: [...fresh, ...scope.ids],
      total: scope.total + fresh.length,
      inserted: scope.loading ? [...fresh, ...scope.inserted] : scope.inserted,
    });
  }
  return next;
}

/**
 * Takes ids out of the given scopes, or out of every scope and the card map
 * when they were deleted.
 */
export function removeIds(
  state: IndexState,
  ids: readonly string[],
  from: readonly ScopeKey[] | "everywhere",
): IndexState {
  if (ids.length === 0) return state;
  const gone = new Set(ids);
  const keys = from === "everywhere" ? [...state.scopes.keys()] : from;
  const scopes = new Map(state.scopes);
  for (const key of keys) {
    const scope = scopes.get(key);
    if (!scope) continue;
    const kept = scope.ids.filter((id) => !gone.has(id));
    const removed = scope.loading ? new Set([...scope.removed, ...ids]) : scope.removed;
    if (kept.length === scope.ids.length && removed === scope.removed) continue;
    scopes.set(key, {
      ...scope,
      ids: kept,
      total: Math.max(0, scope.total - (scope.ids.length - kept.length)),
      inserted: scope.inserted.filter((id) => !gone.has(id)),
      removed,
    });
  }
  if (from !== "everywhere") return { ...state, scopes };
  const cards = new Map(state.cards);
  for (const id of ids) cards.delete(id);
  return { cards, scopes };
}

/** Forgets a scope, so the next visit reads it again. */
export function dropScope(state: IndexState, key: ScopeKey): IndexState {
  if (!state.scopes.has(key)) return state;
  const scopes = new Map(state.scopes);
  scopes.delete(key);
  return { ...state, scopes };
}

export const scopeHas = (state: IndexState, key: ScopeKey, id: string) =>
  state.scopes.get(key)?.ids.includes(id) ?? false;
