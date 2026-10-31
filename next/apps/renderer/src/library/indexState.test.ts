import type { CardPage, LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import {
  emptyIndex,
  failLoad,
  type IndexState,
  placeCards,
  receivePage,
  removeIds,
  startLoad,
  updateCards,
} from "./indexState.ts";

// A card's place in the library's order is its `updatedAt`, given here as the
// position of its letter: "c" sorts above "b", which sorts above "a". Scopes
// load at time 10, so a card created at 50 is new and one created at 0 is not.
const card = (id: string, fields: Partial<LibraryCard> = {}): LibraryCard => ({
  id,
  kind: "note",
  title: id,
  description: null,
  sourceUrl: null,
  sourceLabel: null,
  localAssetPath: null,
  thumbnailPath: null,
  ocrText: "",
  createdAt: 0,
  updatedAt: id.charCodeAt(0),
  archived: false,
  metadata: {},
  hasArticleContent: false,
  ...fields,
});

const page = (ids: string[], next: string | null, total: number): CardPage => ({
  cards: ids.map((id) => card(id)),
  next,
  total,
});

const paged = ["Active", "Archived"];
const home = (item: LibraryCard) => (item.archived ? "Archived" : "Active");
const place = (state: IndexState, cards: LibraryCard[]) => placeCards(state, cards, paged, home);

function loaded(
  ids: string[],
  next: string | null = null,
  total = ids.length,
  key = "Active",
  state = emptyIndex,
) {
  const started = startLoad(state, key, "first", 1, 10);
  if (!started) throw new Error("first load refused");
  return receivePage(started, key, 1, page(ids, next, total));
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
    const next = place(loaded(["b", "a"]), [card("c", { createdAt: 50 })]);
    expect(ids(next)).toEqual(["c", "b", "a"]);
    expect(next.scopes.get("Active")?.total).toBe(3);
  });

  it("keeps a card captured while the first page was loading", () => {
    const loading = startLoad(emptyIndex, "Active", "first", 1, 10)!;
    const captured = place(loading, [card("n", { createdAt: 50 })]);
    // The page was read before the capture, so it does not hold the new card.
    const answered = receivePage(captured, "Active", 1, page(["c", "b"], null, 2));
    expect(ids(answered)).toEqual(["n", "c", "b"]);
    expect(answered.scopes.get("Active")?.total).toBe(3);
  });

  it("places a card updated after load by its updatedAt, so paging neither skips nor repeats it", () => {
    // Six items, read as [f, d] so far; e and c were edited after that read.
    const first = loaded(["f", "d"], "cursor", 6);
    // e moved above the cursor, so no later page holds it: it goes between f and d.
    const moved = place(first, [card("e")]);
    expect(ids(moved)).toEqual(["f", "e", "d"]);
    expect(moved.scopes.get("Active")?.total).toBe(6);
    // c still sorts below everything read, so its page brings it, once.
    const waiting = place(moved, [card("c")]);
    expect(ids(waiting)).toEqual(["f", "e", "d"]);
    const more = startLoad(waiting, "Active", "more", 2)!;
    const answered = receivePage(more, "Active", 2, page(["c", "b", "a"], null, 6));
    expect(ids(answered)).toEqual(["f", "e", "d", "c", "b", "a"]);
    expect(answered.scopes.get("Active")?.total).toBe(6);
    // Edited after everything loaded, a card newer than all of them goes to the top.
    expect(ids(place(answered, [card("z")]))?.[0]).toBe("z");
  });

  it("keeps an edited card where it is shown", () => {
    const state = loaded(["c", "b", "a"]);
    const next = place(state, [card("a", { updatedAt: 100, title: "renamed" })]);
    expect(ids(next)).toEqual(["c", "b", "a"]);
    expect(next.cards.get("a")?.title).toBe("renamed");
  });

  it("moves an archived card to the archive and back, counting both", () => {
    const both = loaded(["y"], null, 1, "Archived", loaded(["c", "b", "a"]));
    const archived = place(both, [card("b", { archived: true, updatedAt: 200 })]);
    expect(ids(archived)).toEqual(["c", "a"]);
    expect(ids(archived, "Archived")).toEqual(["b", "y"]);
    expect(archived.scopes.get("Active")?.total).toBe(2);
    expect(archived.scopes.get("Archived")?.total).toBe(2);

    const restored = place(archived, [card("b", { updatedAt: 300 })]);
    expect(ids(restored)).toEqual(["b", "c", "a"]);
    expect(ids(restored, "Archived")).toEqual(["y"]);
    expect(restored.scopes.get("Active")?.total).toBe(3);
    expect(restored.scopes.get("Archived")?.total).toBe(1);
  });

  it("keeps a card a change refetched over the older copy a slower page brings", () => {
    const loading = startLoad(loaded(["c"], "cursor", 3), "Active", "more", 2)!;
    const changed = place(loading, [card("c", { title: "renamed", updatedAt: 500 })]);
    const answered = receivePage(changed, "Active", 2, {
      cards: [card("c"), card("b")],
      next: null,
      total: 3,
    });
    expect(answered.cards.get("c")?.title).toBe("renamed");
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
    const next = updateCards(state, [card("a", { title: "renamed" })]);
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
