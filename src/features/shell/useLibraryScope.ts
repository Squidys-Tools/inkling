import { type Dispatch, type SetStateAction, useState } from "react";
import type { StoredSpace } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";

// What the library shows: everything or one Space, narrowed by a search.
export function useLibraryScope(setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>) {
  const [query, setQuery] = useState("");
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);

  function selectSpace(space: StoredSpace) {
    setActiveSpaceId(space.id);
    setQuery("");
    setSelectedItem(null);
  }

  function clearToDefaultView() {
    setActiveSpaceId(null);
  }

  // A search always runs over the whole library.
  function searchEverything(value: string) {
    clearToDefaultView();
    setQuery(value);
  }

  return {
    query,
    setQuery,
    activeSpaceId,
    setActiveSpaceId,
    selectSpace,
    clearToDefaultView,
    searchEverything,
  };
}
