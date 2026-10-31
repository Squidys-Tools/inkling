import type { LibraryChange } from "@inkling/contracts";
import {
  ensureScope,
  isKnownCard,
  reconcileItems,
  reloadAll,
  reloadSpaceScopes,
  removeItems,
} from "./cards.ts";
import { type LibraryClient, libraryClient, onReconnect } from "./connection.ts";
import { forgetJobs, refreshJobs } from "./jobs.ts";
import { activeScope } from "./scope.ts";
import { search } from "./search.ts";
import { selection } from "./selection.ts";
import { reloadSpaces } from "./spaces.ts";

// Writes and job ticks arrive in bursts; each burst becomes one refetch of the
// cards it named. Jobs only refetch cards the window already shows, since a
// job does not move an item in the library's order.
const pendingItems = new Set<string>();
const pendingJobs = new Set<string>();
let flushTimer: number | null = null;

function scheduleFlush() {
  flushTimer ??= window.setTimeout(() => void flush(), 60);
}

async function flush() {
  flushTimer = null;
  const items = [...pendingItems];
  const jobs = [...pendingJobs];
  pendingItems.clear();
  pendingJobs.clear();
  const ids = [...new Set([...items, ...jobs.filter(isKnownCard)])];
  if (ids.length > 0) {
    try {
      const cards = await (await libraryClient()).cardsById({ ids });
      const gone = reconcileItems(ids, cards);
      search.remove(gone);
      if (items.length > 0) reloadSpaceScopes();
    } catch {
      // The next change, or a reconnect, reads these again.
    }
  }
  void refreshJobs([...new Set([...items, ...jobs])]);
}

export function applyChange(change: LibraryChange) {
  switch (change._tag) {
    case "ItemsChanged":
      for (const id of change.ids) pendingItems.add(id);
      scheduleFlush();
      return;
    case "JobsChanged":
      for (const id of change.itemIds) pendingJobs.add(id);
      scheduleFlush();
      return;
    case "ItemsRemoved":
      removeItems(change.ids);
      search.remove(change.ids);
      forgetJobs(change.ids);
      if (change.ids.includes(selection.get() ?? "")) selection.set(null);
      return;
    case "SpacesChanged":
      void reloadSpaces();
      reloadSpaceScopes();
      return;
  }
}

let started = false;
let stopChanges: (() => void) | undefined;

function attach(client: LibraryClient) {
  stopChanges?.();
  stopChanges = client.changes(applyChange);
}

/** Follows the library's changes for as long as the window is open, across library restarts. */
export function startLibrarySync() {
  if (started) return;
  started = true;
  void libraryClient().then(attach, () => {});
  // The sidebar counts everything, whichever scope the window opened on.
  ensureScope(activeScope);
  void reloadSpaces();
  onReconnect((client) => {
    attach(client);
    reloadAll();
    void reloadSpaces();
  });
}
