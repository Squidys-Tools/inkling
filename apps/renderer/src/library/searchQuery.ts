import type { LibraryCard } from "@inkling/contracts";
import { errorMessage } from "./errors.ts";
import { createStore, type Store } from "./store.ts";

export type SearchState = {
  /** What the field holds, updated on every keystroke. */
  query: string;
  /** Result ids for the last query that ran, or null when nothing is searched. */
  results: readonly string[] | null;
  /** The query `results` answer. */
  ran: string;
  status: "idle" | "searching" | "ready" | "error";
  error: string | null;
};

const idle: SearchState = { query: "", results: null, ran: "", status: "idle", error: null };

type Timers = {
  set: (run: () => void, delay: number) => number;
  clear: (handle: number) => void;
};

/**
 * Search runs in the library process after a pause in typing or on Enter,
 * never per keystroke. Only the newest query's answer lands: an older search
 * that finishes late is dropped.
 */
export function createSearch({
  run,
  onCards,
  delay = 220,
  timers = {
    set: (callback, wait) => window.setTimeout(callback, wait),
    clear: (handle) => window.clearTimeout(handle),
  },
}: {
  run: (query: string) => Promise<readonly LibraryCard[]>;
  onCards: (cards: readonly LibraryCard[]) => void;
  delay?: number;
  timers?: Timers;
}) {
  const store: Store<SearchState> = createStore(idle);
  let timer: number | null = null;
  let generation = 0;
  // Ids deleted or archived while the newest search was in flight; its answer was read before that.
  let removedSince = new Set<string>();

  const cancelTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  async function execute(again = false) {
    cancelTimer();
    const query = store.get().query.trim();
    if (!query) return;
    const current = store.get();
    if (!again && current.ran === query && current.status === "ready") return;
    const mine = ++generation;
    const removed = new Set<string>();
    removedSince = removed;
    store.set({ ...current, status: "searching", error: null });
    try {
      const cards = (await run(query)).filter((card) => !removed.has(card.id));
      if (mine !== generation) return;
      onCards(cards);
      store.set((state) => ({
        ...state,
        results: cards.map((card) => card.id),
        ran: query,
        status: "ready",
      }));
    } catch (error) {
      if (mine !== generation) return;
      store.set((state) => ({ ...state, status: "error", error: errorMessage(error) }));
    }
  }

  return {
    store,
    setQuery(query: string) {
      cancelTimer();
      if (!query.trim()) {
        generation += 1;
        store.set({ ...idle, query });
        return;
      }
      store.set((state) => ({ ...state, query }));
      timer = timers.set(() => void execute(), delay);
    },
    /** Enter: search now instead of after the pause. */
    submit: () => execute(),
    /** Searches the current query again, after a restore replaced what it ran against. */
    rerun: () => execute(true),
    clear() {
      cancelTimer();
      generation += 1;
      store.set(idle);
    },
    /** Takes deleted or archived items out of the results without searching again. */
    remove(ids: readonly string[]) {
      for (const id of ids) removedSince.add(id);
      const gone = new Set(ids);
      store.set((state) =>
        state.results?.some((id) => gone.has(id))
          ? { ...state, results: state.results.filter((id) => !gone.has(id)) }
          : state,
      );
    },
  };
}
