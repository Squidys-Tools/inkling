import type { LibraryChange } from "@inkling/contracts";
import { QueryClient, queryOptions } from "@tanstack/react-query";
import { type LibraryClient, libraryClient, onReconnect } from "./library/connection.ts";

export const queryClient = new QueryClient({
  // Library changes arrive as events and invalidate what they name, so focus
  // refetches would only repeat reads. Failures show at once instead of retrying.
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
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

const invalidate = (change: LibraryChange) =>
  void queryClient.invalidateQueries(
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
    void queryClient.invalidateQueries({ queryKey: ["library"] });
  });
}
