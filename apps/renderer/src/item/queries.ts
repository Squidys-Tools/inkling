import type { LibraryChange } from "@inkling/contracts";
import { useQuery } from "@tanstack/react-query";
import { libraryQuery } from "../queryClient.ts";

const touches = (id: string) => (change: LibraryChange) =>
  (change._tag === "ItemsChanged" || change._tag === "ItemsRemoved") && change.ids.includes(id);

/** The item's record without its article HTML; null once it is no longer in the library. */
export const useItem = (id: string) =>
  useQuery(libraryQuery(["item", id], (client) => client.item({ id }), touches(id)));

/** The saved article's HTML, for the reader alone; null when the item has none. */
export const useArticleHtml = (id: string) =>
  useQuery(libraryQuery(["article", id], (client) => client.articleHtml({ id }), touches(id)));

/** The ids of the Regular Spaces the item is filed in. */
export const useMemberships = (id: string) =>
  useQuery(
    libraryQuery(
      ["memberships", id],
      (client) => client.itemSpaces({ itemId: id }),
      (change) => change._tag === "SpacesChanged",
    ),
  );
