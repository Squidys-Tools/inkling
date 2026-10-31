import type { LibraryCard } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import { createSearch } from "./searchQuery.ts";

const card = (id: string) => ({ id }) as LibraryCard;

/** A search whose timers and library answers the test releases by hand. */
function harness() {
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const pending: { query: string; resolve: (cards: LibraryCard[]) => void }[] = [];
  const search = createSearch({
    run: (query) => new Promise((resolve) => pending.push({ query, resolve })),
    onCards: () => {},
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
  return { search, firePause, answer, pending, timers };
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
});
