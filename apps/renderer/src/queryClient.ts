import type { LibraryChange } from "@inkling/contracts";
import { QueryClient, type QueryFilters, queryOptions } from "@tanstack/react-query";
import { type LibraryClient, libraryClient, onReconnect } from "./library/connection.ts";

// Nothing here uses the network, and the library announces its own changes, so
// reads neither pause offline nor refetch on focus. Failures show at once.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: { networkMode: "always" },
  },
});

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: { affects?: (change: LibraryChange) => boolean };
  }
}

/**
 * A read from the library, read again when a change passes `affects`. Its key
 * starts with "library", so a restore or a library restart reads it again too.
 */
export const libraryQuery = <T>(
  key: readonly unknown[],
  load: (client: LibraryClient) => Promise<T>,
  affects?: (change: LibraryChange) => boolean,
) =>
  queryOptions({
    queryKey: ["library", ...key],
    queryFn: async () => load(await libraryClient()),
    meta: { affects },
  });

// Invalidating joins a first load already in flight, which may predate the
// change or hang on a dead library port; cancelling first makes the newest read win.
export const reread = (filters: QueryFilters) =>
  void queryClient.cancelQueries(filters).then(() => queryClient.invalidateQueries(filters));

const invalidate = (change: LibraryChange) =>
  reread(
    change._tag === "LibraryReplaced"
      ? { queryKey: ["library"] }
      : { predicate: (query) => query.meta?.affects?.(change) === true },
  );

let stopChanges: (() => void) | undefined;

function follow(client: LibraryClient) {
  stopChanges?.();
  stopChanges = client.changes(invalidate);
}

/** Keeps library reads current for as long as the window is open, across library restarts. */
export function followLibraryChanges() {
  void libraryClient().then(follow, () => {});
  onReconnect((client) => {
    follow(client);
    reread({ queryKey: ["library"] });
  });
}
