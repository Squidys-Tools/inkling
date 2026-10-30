import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  countActiveJobs,
  getChangeCount,
  getItemCards,
  getProcessingSummaries,
  getSearchProgress,
  initializeStorage,
  listActiveItems,
  listenForJobUpdates,
  listSpaceItems,
  searchItemsDetailed,
} from "../../lib/libraryApi";
import { patchItems } from "../../lib/patchItems";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { storedItemToLibraryItem } from "./libraryItem";
import { demoSeedItems } from "./seed";

type LibraryDataOptions = {
  canUseDesktopBackend: boolean;
  query: string;
  activeSpaceId: string | null;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

export function useLibraryData({
  canUseDesktopBackend,
  query,
  activeSpaceId,
  setSelectedItem,
  setCaptureError,
}: LibraryDataOptions) {
  const [items, setItems] = useState<LibraryItem[]>(shouldUseSeedLibrary() ? demoSeedItems : []);
  const [activeJobCount, setActiveJobCount] = useState<number | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searchProgress, setSearchProgress] = useState<{ ready: number; total: number } | null>(
    null,
  );
  // Debounced copy of the search box. The input stays instant; only the
  // backend round trip waits, so typing "design" issues one search instead
  // of six full reloads (search + N x job status + N x asset URL).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const requestRef = useRef({ query, activeSpaceId });
  requestRef.current = { query, activeSpaceId };
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), query.trim() ? 60 : 0);
    return () => window.clearTimeout(timer);
  }, [query]);
  const noteBodyCacheRef = useRef(new Map<string, string>());
  // Latest loadItems, assigned by the data effect. Job-event callbacks and
  // post-mutation refreshes call through here so they never go stale.
  const loadItemsRef = useRef<() => void>(() => {});
  // Mirror of `items` for callbacks that must read the newest value without
  // being rebuilt on every load, or that run long after they were set up.
  const itemsRef = useRef<LibraryItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (shouldUseSeedLibrary()) return;
    let cancelled = false;
    let loading = false;
    let queued = false;
    // Bumped by every full load, so a patch fetched before one cannot land over
    // data that load read afterwards.
    let fullLoadEpoch = 0;
    const current = () =>
      !cancelled && requestRef.current.query === debouncedQuery &&
      requestRef.current.activeSpaceId === activeSpaceId;
    // Job events name the item they touched. Only the plain library can patch
    // in place: a query or Space can gain or lose members when a job lands.
    const patchesInPlace = !activeSpaceId && !debouncedQuery.trim();
    const changedIds = new Set<string>();
    let reloadAll = false;
    // The backend's write count as of the last full load. The fallback refresh
    // below only reloads when it has moved, so an idle library is never re-read.
    let seenChanges: number | null = null;
    const readChanges = () =>
      canUseDesktopBackend ? getChangeCount().catch(() => null) : Promise.resolve(null);

    // A refresh can resolve with data older than a note body this session
    // already saved, so the cached body is re-applied.
    function withSessionState(item: LibraryItem) {
      const noteBody = noteBodyCacheRef.current.get(String(item.id));
      return noteBody === undefined ? item : { ...item, noteBody };
    }

    function syncSelectedItem(libraryItems: LibraryItem[]) {
      setSelectedItem((current) => {
        // Web items refresh as extraction fills them in; an image as its
        // thumbnail and palette jobs land.
        const isWebItem =
          Boolean(current?.sourceUrl) &&
          (current?.kind === "Article" || current?.kind === "Video" || current?.kind === "Post");
        if (!current || (!isWebItem && current.kind !== "Image")) return current;
        const refreshed = libraryItems.find((item) => String(item.id) === String(current.id));
        if (!refreshed) return current;
        const changed =
          current.kind !== refreshed.kind ||
          current.title !== refreshed.title ||
          current.description !== refreshed.description ||
          current.source !== refreshed.source ||
          current.sourceUrl !== refreshed.sourceUrl ||
          current.image !== refreshed.image ||
          current.mediaAspectRatio !== refreshed.mediaAspectRatio ||
          current.palette?.join() !== refreshed.palette?.join() ||
          current.hasArticleContent !== refreshed.hasArticleContent ||
          current.processing?.active !== refreshed.processing?.active ||
          current.processing?.failedJob?.id !== refreshed.processing?.failedJob?.id ||
          current.processing?.failedJob?.status !== refreshed.processing?.failedJob?.status;
        return changed ? { ...current, ...refreshed } : current;
      });
    }

    async function loadItems() {
      // A refresh requested mid-flight is requeued instead of dropped, so a
      // job event landing during a slow load still resolves promptly.
      if (loading) {
        queued = true;
        return;
      }
      loading = true;
      const epoch = ++fullLoadEpoch;
      const canPublish = () => current() && epoch === fullLoadEpoch;
      const publish = async (storedItems: Awaited<ReturnType<typeof listActiveItems>>) => {
        const summaries = await getProcessingSummaries(storedItems.map((item) => item.id));
        if (!canPublish()) return;
        const libraryItems = await Promise.all(
          storedItems.map((item) => storedItemToLibraryItem(item, summaries.get(item.id))),
        );
        if (!canPublish()) return;
        setItems(libraryItems.map(withSessionState));
        syncSelectedItem(libraryItems);
      };
      try {
        await initializeStorage();
        if (!debouncedQuery.trim() && current()) setSearchNotice(null);
        // Indexed text paints before model inference, retaining upstream card reads.
        const changesPromise = readChanges();
        const storedItemsPromise = activeSpaceId
          ? listSpaceItems(activeSpaceId)
          : debouncedQuery.trim()
            ? searchItemsDetailed(debouncedQuery, true).then((reply) => {
                if (canPublish()) setSearchNotice(reply.message);
                return reply.items;
              })
            : listActiveItems();
        const activeJobsPromise = canUseDesktopBackend
          ? countActiveJobs().catch(() => null)
          : Promise.resolve(null);
        const [changes, storedItems, activeJobs] = await Promise.all([
          changesPromise, storedItemsPromise, activeJobsPromise,
        ]);
        if (canUseDesktopBackend) {
          const progress = await getSearchProgress().catch(() => null);
          if (canPublish()) setSearchProgress(progress);
        }
        if (!canPublish()) return;
        seenChanges = changes;
        if (activeJobs !== null) setActiveJobCount(activeJobs);
        await publish(storedItems);
        if (!activeSpaceId && debouncedQuery.trim() && canPublish()) {
          void searchItemsDetailed(debouncedQuery)
            .then(async (reply) => {
              if (!canPublish()) return;
              setSearchNotice(reply.message);
              await publish(reply.items);
            })
            .catch(() => {
              if (canPublish())
                setSearchNotice("Visual search is unavailable; showing text matches.");
            });
        }
      } catch (error) {
        if (canPublish()) setCaptureError(error instanceof Error ? error.message : String(error));
      } finally {
        loading = false;
        if (queued && !cancelled) {
          queued = false;
          await loadItems();
        }
      }
    }

    // Applies just the items a burst of job events named. Anything that cannot
    // be patched safely falls back to the full load.
    async function patchChangedItems() {
      const ids = [...changedIds];
      changedIds.clear();
      if (ids.length === 0) return;
      // A full load in flight may have read before these jobs finished.
      if (loading) {
        queued = true;
        return;
      }
      const epoch = fullLoadEpoch;
      try {
        const [cards, summaries, activeJobs] = await Promise.all([
          getItemCards(ids),
          getProcessingSummaries(ids),
          countActiveJobs().catch(() => null),
        ]);
        // An active item the list has never seen is new, and where it sorts is
        // the full load's call.
        const known = new Set(itemsRef.current.map((item) => String(item.id)));
        if (cards.some((card) => !known.has(card.id))) {
          void loadItems();
          return;
        }
        const libraryItems = await Promise.all(
          cards.map((card) => storedItemToLibraryItem(card, summaries.get(card.id))),
        );
        if (cancelled || epoch !== fullLoadEpoch) return;
        if (activeJobs !== null) setActiveJobCount(activeJobs);
        const patched = new Map(
          libraryItems.map((item) => [String(item.id), withSessionState(item)]),
        );
        setItems((current) => patchItems(current, new Set(ids), patched));
        syncSelectedItem(libraryItems);
      } catch {
        if (!cancelled) void loadItems();
      }
    }

    void loadItems();
    // Job events (`inkling:job-updated` in main.mjs) are coalesced, so a burst of
    // progress ticks becomes one trailing refresh. The slow fallback survives
    // missed events: a dropped listener must never mean a stale library.
    loadItemsRef.current = loadItems;
    let coalesceTimer = 0;
    let removeJobListener: (() => void) | null = null;
    void listenForJobUpdates((payload) => {
      if (patchesInPlace && payload?.itemId) changedIds.add(String(payload.itemId));
      else reloadAll = true;
      window.clearTimeout(coalesceTimer);
      coalesceTimer = window.setTimeout(() => {
        if (reloadAll) {
          reloadAll = false;
          changedIds.clear();
          void loadItems();
        } else {
          void patchChangedItems();
        }
      }, 400);
    })
      .then((removeListener) => {
        if (cancelled) removeListener();
        else removeJobListener = removeListener;
      })
      .catch(() => {});
    const reloadIfChanged = async () => {
      const changes = seenChanges === null ? null : await readChanges();
      if (changes === null || changes !== seenChanges) void loadItems();
    };
    const refreshTimer = window.setInterval(() => {
      if (document.hidden) return;
      void reloadIfChanged();
    }, 30000);
    const handleVisibility = () => {
      if (!document.hidden) void reloadIfChanged();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(coalesceTimer);
      removeJobListener?.();
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [debouncedQuery, activeSpaceId, canUseDesktopBackend, setCaptureError, setSelectedItem]);

  const reload = useCallback(() => loadItemsRef.current(), []);

  return {
    items,
    setItems,
    itemsRef,
    activeJobCount,
    searchNotice,
    searchProgress,
    debouncedQuery,
    noteBodyCacheRef,
    reload,
  };
}
