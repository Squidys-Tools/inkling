import type { CardPage, LibraryCard } from "@inkling/contracts";
import type { ScopeKey } from "./scope.ts";

// The library's order, newest first: updated_at, then created_at, then id.
type SortKey = readonly [updatedAt: number, createdAt: number, id: string];
const keyOf = (card: LibraryCard): SortKey => [card.updatedAt, card.createdAt, card.id];
const sortsBefore = (a: SortKey, b: SortKey) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];

type ScopeState = {
  ids: readonly string[];
  next: string | null;
  // The last card of the pages read so far. A card that sorts after it comes
  // with a later page; one that sorts before it never will, so it is placed now.
  floor: SortKey | null;
  total: number;
  // When the first page was asked for. Its total counts every item created
  // before then, so only a card created later adds to it when it arrives.
  since: number;
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

function withCards(
  cards: ReadonlyMap<string, LibraryCard>,
  incoming: readonly LibraryCard[],
  keepNewer = false,
) {
  let next: Map<string, LibraryCard> | null = null;
  for (const card of incoming) {
    const held = cards.get(card.id);
    if (keepNewer && held && held.updatedAt > card.updatedAt) continue;
    next ??= new Map(cards);
    next.set(card.id, card);
  }
  return next ?? cards;
}

/** `ids` with the card where the library's order puts it, or null when a later page brings it. */
function placed(
  ids: readonly string[],
  cards: ReadonlyMap<string, LibraryCard>,
  card: LibraryCard,
  { floor, next }: { floor: SortKey | null; next: string | null },
) {
  const key = keyOf(card);
  if (next !== null && floor && !sortsBefore(key, floor)) return null;
  const at = ids.findIndex((id) => {
    const other = cards.get(id);
    return other !== undefined && sortsBefore(key, keyOf(other));
  });
  return at < 0 ? [...ids, card.id] : [...ids.slice(0, at), card.id, ...ids.slice(at)];
}

/** Starts reading a scope from its first page, or its next page after what it holds. */
export function startLoad(
  state: IndexState,
  key: ScopeKey,
  mode: "first" | "more",
  request: number,
  now = Date.now(),
): IndexState | null {
  const scope = state.scopes.get(key);
  if (mode === "more" && (!scope || scope.loading || scope.status !== "ready" || !scope.next))
    return null;
  return withScope(state, key, {
    ids: scope?.ids ?? noIds,
    next: scope?.next ?? null,
    floor: scope?.floor ?? null,
    total: scope?.total ?? 0,
    since: mode === "first" ? now : (scope?.since ?? now),
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
  // A page may have been read before a change this window already applied.
  const cards = withCards(state.cards, page.cards, true);
  const pageIds = page.cards.map((card) => card.id).filter((id) => !scope.removed.has(id));
  const dropped = page.cards.length - pageIds.length;
  const last = page.cards.at(-1);
  const floor = last ? keyOf(last) : scope.loading === "first" ? null : scope.floor;
  let ids: readonly string[];
  let total: number;
  if (scope.loading === "first") {
    ids = pageIds;
    let fresh = 0;
    for (const id of scope.inserted) {
      const card = cards.get(id);
      if (!card || ids.includes(id)) continue;
      const withCard = placed(ids, cards, card, { floor, next: page.next });
      if (!withCard) continue;
      ids = withCard;
      if (card.createdAt >= scope.since) fresh += 1;
    }
    total = page.total - dropped + fresh;
  } else {
    const known = new Set(scope.ids);
    ids = [...scope.ids, ...pageIds.filter((id) => !known.has(id))];
    total = Math.max(page.total - dropped, ids.length);
  }
  return {
    cards,
    scopes: new Map(state.scopes).set(key, {
      ids,
      next: page.next,
      floor,
      total,
      since: scope.since,
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

/**
 * Replaces cards the library sent again; their place in each scope stays.
 * `keepNewer` is for answers that may have been read before a change this window already holds.
 */
export function updateCards(
  state: IndexState,
  cards: readonly LibraryCard[],
  keepNewer = false,
): IndexState {
  if (cards.length === 0) return state;
  const next = withCards(state.cards, cards, keepNewer);
  return next === state.cards ? state : { ...state, cards: next };
}

/**
 * Applies cards the library sent again, each to the paged scope `home` names
 * for it. A card leaves the other paged scopes; where it is already shown it
 * keeps its place, and elsewhere it goes where the library's order puts it.
 */
export function placeCards(
  state: IndexState,
  cards: readonly LibraryCard[],
  paged: readonly ScopeKey[],
  home: (card: LibraryCard) => ScopeKey,
): IndexState {
  let next = updateCards(state, cards);
  for (const card of cards) {
    const previous = state.cards.get(card.id);
    const target = home(card);
    for (const key of paged) {
      const scope = next.scopes.get(key);
      if (key === target || !scope) continue;
      const held = scope.ids.includes(card.id);
      // A known card was counted in this scope's total even when its page is not loaded.
      const counted = held || (previous !== undefined && home(previous) === key);
      if (!counted && !scope.loading) continue;
      next = withScope(next, key, {
        ...scope,
        ids: held ? scope.ids.filter((id) => id !== card.id) : scope.ids,
        total: counted ? Math.max(0, scope.total - 1) : scope.total,
        inserted: scope.inserted.filter((id) => id !== card.id),
        removed: scope.loading ? new Set([...scope.removed, card.id]) : scope.removed,
      });
    }
    const scope = next.scopes.get(target);
    if (!scope || scope.ids.includes(card.id)) continue;
    const ids = placed(scope.ids, next.cards, card, scope);
    if (!ids) continue;
    const removed = new Set(scope.removed);
    removed.delete(card.id);
    const arrived =
      previous === undefined ? card.createdAt >= scope.since : home(previous) !== target;
    next = withScope(next, target, {
      ...scope,
      ids,
      total: scope.total + (arrived ? 1 : 0),
      inserted: scope.loading ? [card.id, ...scope.inserted] : scope.inserted,
      removed: removed.size === scope.removed.size ? scope.removed : removed,
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
