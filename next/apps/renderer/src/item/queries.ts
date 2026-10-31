import type { LibraryChange } from "@inkling/contracts";
import { useLibraryQuery } from "./useLibraryQuery.ts";

const touches = (id: string) => (change: LibraryChange) =>
  (change._tag === "ItemsChanged" || change._tag === "ItemsRemoved") && change.ids.includes(id);

/** The item's full record; null once it is no longer in the library. */
export const useItem = (id: string) =>
  useLibraryQuery(`item:${id}`, (client) => client.item({ id }), touches(id));

/** The ids of the Regular Spaces the item is filed in. */
export const useMemberships = (id: string) =>
  useLibraryQuery(
    `memberships:${id}`,
    (client) => client.itemSpaces({ itemId: id }),
    (change) => change._tag === "SpacesChanged",
  );
