import { storeCards } from "./cards.ts";
import { libraryClient } from "./connection.ts";
import { createSearch, type SearchState } from "./searchQuery.ts";
import { useSelector } from "@tanstack/react-store";

export const search = createSearch({
  run: async (query, semantic) => (await libraryClient()).search({ query, limit: 200, semantic }),
  onCards: storeCards,
});

export const useSearch = <Selected>(select: (state: SearchState) => Selected) =>
  useSelector(search.store, select);
