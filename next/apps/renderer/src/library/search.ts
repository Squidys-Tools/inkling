import { storeCards } from "./cards.ts";
import { libraryClient } from "./connection.ts";
import { createSearch, type SearchState } from "./searchQuery.ts";
import { useStore } from "./store.ts";

export const search = createSearch({
  run: async (query) => (await libraryClient()).search({ query, limit: 200 }),
  onCards: storeCards,
});

export const useSearch = <Selected>(select: (state: SearchState) => Selected) =>
  useStore(search.store, select);
