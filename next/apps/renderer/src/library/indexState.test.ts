import type { CardPage, LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import {
  emptyIndex,
  failLoad,
  type IndexState,
  prependCards,
  receivePage,
  removeIds,
  startLoad,
  updateCards,
} from "./indexState.ts";

const card = (id: string, title = id): LibraryCard => ({
  id,
  kind: "note",
  title,
  description: null,
  sourceUrl: null,
  sourceLabel: null,
  localAssetPath: null,
  thumbnailPath: null,
  ocrText: "",
  createdAt: 0,
  archived: false,
  metadata: {},
  hasArticleContent: false,
});

const page = (ids: string[], next: string | null, total: number): CardPage => ({
  cards: ids.map((id) => card(id)),
  next,
  total,
});

function loaded(ids: string[], next: string | null = null, total = ids.length) {
  const started = startLoad(emptyIndex, "Active", "first", 1);
  if (!started) throw new Error("first load refused");
  return receivePage(started, "Active", 1, page(ids, next, total));
}

const ids = (state: IndexState, key = "Active") => state.scopes.get(key)?.ids;

describe("library index paging", () => {
  it("appends the next page after what it holds and skips ids it already has", () => {
    const first = loaded(["c", "b"], "cursor", 4);
    const started = startLoad(first, "Active", "more", 2);
    expect(started).not.toBeNull();
    const next = receivePage(started!, "Active", 2, page(["b", "a"], null, 4));
    expect(ids(next)).toEqual(["c", "b", "a"]);
    expect(next.scopes.get("Active")?.next).toBeNull();
  });

  it("refuses a next page while one is loading or when there is none", () => {
    const first = loaded(["a"], "cursor", 2);
    const loading = startLoad(first, "Active", "more", 2)!;
    expect(startLoad(loading, "Active", "more", 3)).toBeNull();
    expect(startLoad(loaded(["a"]), "Active", "more", 3)).toBeNull();
  });

  it("drops an answer a newer request superseded", () => {
    const started = startLoad(emptyIndex, "Active", "first", 1)!;
    const restarted = startLoad(started, "Active", "first", 2)!;
    const stale = receivePage(restarted, "Active", 1, page(["old"], null, 1));
    expect(ids(stale)).toEqual([]);
    const fresh = receivePage(stale, "Active", 2, page(["new"], null, 1));
    expect(ids(fresh)).toEqual(["new"]);
  });

  it("keeps what is shown when a next page fails, and shows the error when a first page fails", () => {
    const first = loaded(["a"], "cursor", 2);
    const more = failLoad(startLoad(first, "Active", "more", 2)!, "Active", 2, "offline");
    expect(more.scopes.get("Active")).toMatchObject({ status: "ready", ids: ["a"], loading: null });
    const fresh = failLoad(startLoad(emptyIndex, "Active", "first", 1)!, "Active", 1, "offline");
    expect(fresh.scopes.get("Active")).toMatchObject({ status: "error", error: "offline" });
  });
});

describe("library index changes", () => {
  it("puts new cards on top and counts them", () => {
    const next = prependCards(loaded(["b", "a"]), [card("c")], ["Active"]);
    expect(ids(next)).toEqual(["c", "b", "a"]);
    expect(next.scopes.get("Active")?.total).toBe(3);
  });

  it("keeps a card captured while the first page was loading", () => {
    const loading = startLoad(emptyIndex, "Active", "first", 1)!;
    const captured = prependCards(loading, [card("new")], ["Active"]);
    // The page was read before the capture, so it does not hold the new card.
    const answered = receivePage(captured, "Active", 1, page(["b", "a"], null, 2));
    expect(ids(answered)).toEqual(["new", "b", "a"]);
    expect(answered.scopes.get("Active")?.total).toBe(3);
  });

  it("does not bring back a card removed while its page was loading", () => {
    const loading = startLoad(loaded(["c"], "cursor", 3), "Active", "more", 2)!;
    const removed = removeIds(loading, ["b"], "everywhere");
    const answered = receivePage(removed, "Active", 2, page(["b", "a"], null, 3));
    expect(ids(answered)).toEqual(["c", "a"]);
  });

  it("replaces a changed card without moving it", () => {
    const state = loaded(["b", "a"]);
    const before = state.cards.get("b");
    const next = updateCards(state, [card("a", "renamed")]);
    expect(ids(next)).toEqual(["b", "a"]);
    expect(next.cards.get("a")?.title).toBe("renamed");
    // Untouched cards keep their object, so their cells do not re-render.
    expect(next.cards.get("b")).toBe(before);
  });

  it("takes archived items out of the named scopes but keeps their cards", () => {
    const next = removeIds(loaded(["b", "a"]), ["a"], ["Active"]);
    expect(ids(next)).toEqual(["b"]);
    expect(next.scopes.get("Active")?.total).toBe(1);
    expect(next.cards.has("a")).toBe(true);
  });

  it("forgets deleted items everywhere", () => {
    const next = removeIds(loaded(["b", "a"]), ["a"], "everywhere");
    expect(ids(next)).toEqual(["b"]);
    expect(next.cards.has("a")).toBe(false);
  });
});
