import type { LibraryChange, Space } from "@inkling/contracts";
import { ensureScope, reconcileItems, reloadAll, reloadSpaceScopes, removeItems } from "./cards.ts";
import { type LibraryClient, libraryClient, onReconnect } from "./connection.ts";
import { forgetJobs, refreshActiveJobCount, refreshJobs } from "./jobs.ts";
import { activeScope } from "./scope.ts";
import { search } from "./search.ts";
import { selection } from "./selection.ts";
import { reloadSpaces, spacesStore } from "./spaces.ts";

// Writes and job ticks arrive in bursts; each burst becomes one refetch of the
// cards it named and one read of their jobs. A job tick reads jobs only: the
// job's result arrives as its own ItemsChanged. Neither re-runs a Smart
// Space's query, which runs when the Space is opened or this window writes.
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
  if (items.length > 0) {
    try {
      const cards = await (await libraryClient()).cardsById({ ids: items });
      search.remove(reconcileItems(items, cards));
    } catch {
      // The next change, or a reconnect, reads these again.
    }
  }
  void refreshJobs([...new Set([...items, ...jobs])]);
  if (jobs.length > 0) void refreshActiveJobCount();
}

// A Smart Space named for a photo subject ("Cats") collects by its name, so a rename reads it again.
const sameQuery = (a: Space, b: Space) =>
  a.name === b.name &&
  (a.query.text ?? null) === (b.query.text ?? null) &&
  (a.query.kind ?? null) === (b.query.kind ?? null) &&
  (a.query.tag ?? null) === (b.query.tag ?? null);

// A Regular Space's items may have moved; a Smart Space reads again only when its query or name changed.
async function spacesChanged() {
  const before = new Map(spacesStore.get().spaces.map((space) => [space.id, space]));
  await reloadSpaces();
  const after = new Map(spacesStore.get().spaces.map((space) => [space.id, space]));
  reloadSpaceScopes((spaceId) => {
    const space = after.get(spaceId);
    const previous = before.get(spaceId);
    if (!space) return "gone";
    return space.kind === "regular" || !previous || !sameQuery(previous, space) ? "stale" : null;
  });
}

/** Reads every store again: after the library process restarts, or a restore replaced its contents. */
function reloadEverything() {
  reloadAll();
  void reloadSpaces();
  void refreshActiveJobCount();
  void search.rerun();
}

/** Applies one change; a kind this build does not know is ignored. */
function applyChange(change: LibraryChange) {
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
      void spacesChanged();
      return;
    case "LibraryReplaced":
      reloadEverything();
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
  void refreshActiveJobCount();
  onReconnect((client) => {
    attach(client);
    reloadEverything();
  });
}
