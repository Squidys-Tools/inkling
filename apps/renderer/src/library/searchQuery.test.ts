import type { LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import { createSearch } from "./searchQuery.ts";

const card = (id: string) => ({ id }) as LibraryCard;

/** A search whose timers and library answers the test releases by hand. */
function harness({ text }: { text?: (query: string) => Promise<LibraryCard[]> } = {}) {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const pending: { query: string; resolve: (cards: LibraryCard[]) => void }[] = [];
  const stored: LibraryCard[] = [];
  const search = createSearch({
    // The text-first pass is off unless a test supplies it, so the semantic answer decides.
    run: (query, semantic) =>
      semantic
        ? new Promise((resolve) => pending.push({ query, resolve }))
        : (text?.(query) ?? Promise.reject(new Error("text pass off"))),
    onCards: (cards) => void stored.push(...cards),
    timers: {
      set: (run) => {
        timers.set(++nextTimer, run);
        return nextTimer;
      },
      clear: (handle) => void timers.delete(handle),
    },
  });
  const firePause = () => {
    const due = [...timers.values()];
    timers.clear();
    for (const run of due) run();
  };
  const answer = async (query: string, ids: string[]) => {
    const index = pending.findIndex((request) => request.query === query);
    pending.splice(index, 1)[0].resolve(ids.map(card));
    await Promise.resolve();
    await Promise.resolve();
  };
  return { search, firePause, answer, pending, timers, stored };
}

describe("search", () => {
  it("waits for a pause in typing and runs once for the last query", () => {
    const { search, firePause, pending } = harness();
    search.setQuery("d");
    search.setQuery("de");
    search.setQuery("design");
    expect(pending).toHaveLength(0);
    firePause();
    expect(pending.map((request) => request.query)).toEqual(["design"]);
  });

  it("keeps the newest query's answer when an older one lands last", async () => {
    const { search, firePause, answer } = harness();
    search.setQuery("cat");
    firePause();
    search.setQuery("cats");
    firePause();
    await answer("cats", ["new"]);
    await answer("cat", ["old"]);
    expect(search.store.get()).toMatchObject({ results: ["new"], ran: "cats", status: "ready" });
  });

  it("drops a late answer once the field is cleared", async () => {
    const { search, firePause, answer } = harness();
    search.setQuery("cat");
    firePause();
    search.setQuery("");
    await answer("cat", ["late"]);
    expect(search.store.get()).toMatchObject({ results: null, status: "idle" });
  });

  it("runs at once on Enter and cancels the pending pause", async () => {
    const { search, answer, pending, timers } = harness();
    search.setQuery("tea");
    void search.submit();
    expect(timers.size).toBe(0);
    expect(pending.map((request) => request.query)).toEqual(["tea"]);
    await answer("tea", ["a"]);
    expect(search.store.get().results).toEqual(["a"]);
  });

  it("takes removed items out of the results", async () => {
    const { search, firePause, answer } = harness();
    search.setQuery("tea");
    firePause();
    await answer("tea", ["a", "b"]);
    search.remove(["a"]);
    expect(search.store.get().results).toEqual(["b"]);
  });

  it("keeps an item removed while the search ran out of its late answer", async () => {
    const { search, firePause, answer, stored } = harness();
    search.setQuery("tea");
    firePause();
    search.remove(["a"]);
    await answer("tea", ["a", "b"]);
    expect(search.store.get().results).toEqual(["b"]);
    expect(stored.map((card) => card.id)).toEqual(["b"]);
  });

  it("shows text matches at once, then the semantic answer", async () => {
    const { search, firePause, answer } = harness({ text: async () => [card("lexical")] });
    search.setQuery("corgi");
    firePause();
    await Promise.resolve();
    await Promise.resolve();
    expect(search.store.get()).toMatchObject({
      results: ["lexical"],
      ran: "corgi",
      status: "searching",
    });
    await answer("corgi", ["semantic", "lexical"]);
    expect(search.store.get()).toMatchObject({ results: ["semantic", "lexical"], status: "ready" });
  });

  it("shows no empty answer while only the semantic pass can find matches", async () => {
    const { search, firePause, answer } = harness({ text: async () => [] });
    search.setQuery("dog");
    firePause();
    await Promise.resolve();
    await Promise.resolve();
    expect(search.store.get()).toMatchObject({ results: null, status: "searching" });
    await answer("dog", ["corgi"]);
    expect(search.store.get()).toMatchObject({ results: ["corgi"], status: "ready" });
  });

  it("keeps the text matches when the semantic pass fails", async () => {
    const { search, firePause, pending } = harness({ text: async () => [card("lexical")] });
    search.setQuery("corgi");
    firePause();
    await Promise.resolve();
    pending.splice(0, 1)[0].resolve(Promise.reject(new Error("worker gone")) as never);
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
    expect(search.store.get()).toMatchObject({
      results: ["lexical"],
      status: "ready",
      error: null,
    });
  });

  it("drops an older query's text matches once a newer query runs", async () => {
    let release: (cards: LibraryCard[]) => void = () => {};
    const { search, firePause, answer } = harness({
      text: (query) =>
        query === "cat" ? new Promise((resolve) => (release = resolve)) : Promise.resolve([]),
    });
    search.setQuery("cat");
    firePause();
    search.setQuery("cats");
    firePause();
    await answer("cats", ["new"]);
    release([card("old")]);
    await answer("cat", ["old"]);
    expect(search.store.get()).toMatchObject({ results: ["new"], ran: "cats", status: "ready" });
  });
});
