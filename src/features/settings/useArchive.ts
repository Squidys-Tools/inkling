import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "notch-toast";
import {
  archiveItem,
  deleteItem,
  getProcessingSummaries,
  initializeStorage,
  listArchivedItems,
  type ProcessingSummary,
} from "../../lib/libraryApi";
import { shouldUseSeedLibrary } from "../../lib/previewMode";
import type { LibraryItem } from "../../lib/types";
import { storedItemToLibraryItem } from "../library/libraryItem";
import { browserArchivedItems } from "../library/seed";

// One accepted archive delete: the timer waiting out the undo window, plus the
// item that timer needs to restore or reconcile if the delete does not land.
type PendingPermanentDelete = {
  timer: number;
  item: LibraryItem;
};

type ArchiveOptions = {
  canUseDesktopBackend: boolean;
  isSettingsOpen: boolean;
  isArchiveTabOpen: boolean;
  setItems: Dispatch<SetStateAction<LibraryItem[]>>;
  itemsRef: RefObject<LibraryItem[]>;
  noteBodyCacheRef: RefObject<Map<string, string>>;
  selectedItem: LibraryItem | null;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
};

// notch-toast keeps the island up after its action runs, so Undo closes it here.
function undoAction(onUndo: () => void) {
  return {
    label: "Undo",
    onClick: () => {
      toast.dismiss();
      onUndo();
    },
  };
}

export function useArchive({
  canUseDesktopBackend,
  isSettingsOpen,
  isArchiveTabOpen,
  setItems,
  itemsRef,
  noteBodyCacheRef,
  selectedItem,
  setSelectedItem,
  setCaptureError,
}: ArchiveOptions) {
  const [archivedItems, setArchivedItems] = useState<LibraryItem[]>(
    shouldUseSeedLibrary() ? browserArchivedItems : [],
  );
  // The archive is read only while its tab is open, so until that read lands
  // the list is unknown and Settings must not show a count or an empty state.
  const [isArchiveLoaded, setIsArchiveLoaded] = useState(shouldUseSeedLibrary);
  const [isArchiveSelectionMode, setIsArchiveSelectionMode] = useState(false);
  const [selectedArchivedIds, setSelectedArchivedIds] = useState<Set<string>>(() => new Set());
  const pendingPermanentDeletesRef = useRef<Map<string, PendingPermanentDelete>>(new Map());

  const cancelPermanentDelete = useCallback((id: string) => {
    const pending = pendingPermanentDeletesRef.current.get(id);
    if (pending === undefined) return;
    window.clearTimeout(pending.timer);
    pendingPermanentDeletesRef.current.delete(id);
  }, []);

  const restoreForgottenItem = useCallback(
    async (item: LibraryItem) => {
      // A restore un-archives the row, so any scheduled permanent delete for it
      // must be cancelled or its timer would still fire and destroy the assets.
      cancelPermanentDelete(String(item.id));
      try {
        const restoredItem = canUseDesktopBackend
          ? await archiveItem(String(item.id), false).then(async (storedItem) => {
              const summary = (await getProcessingSummaries([storedItem.id])).get(storedItem.id);
              return storedItemToLibraryItem(storedItem, summary);
            })
          : { ...item, archived: false };
        const cachedNoteBody = noteBodyCacheRef.current.get(String(item.id));
        // The restore response carries the description the backend already
        // projected; the cache only holds a body this session edited, so it
        // re-attaches the body without re-deriving the description.
        const restoredLibraryItem =
          cachedNoteBody === undefined
            ? restoredItem
            : { ...restoredItem, noteBody: cachedNoteBody };
        setItems((current) =>
          current.some((currentItem) => String(currentItem.id) === String(item.id))
            ? current
            : [restoredLibraryItem, ...current],
        );
        setArchivedItems((current) =>
          current.filter((currentItem) => String(currentItem.id) !== String(item.id)),
        );
      } catch (error) {
        toast.error("Unable to restore this item");
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [canUseDesktopBackend, cancelPermanentDelete, setCaptureError, setItems, noteBodyCacheRef],
  );

  const forgetItem = useCallback(
    async (item: LibraryItem) => {
      setCaptureError(null);
      try {
        if (canUseDesktopBackend) {
          await archiveItem(String(item.id));
        } else {
          setArchivedItems((current) =>
            current.some((currentItem) => String(currentItem.id) === String(item.id))
              ? current
              : [{ ...item, archived: true }, ...current],
          );
        }
        setItems((current) =>
          current.filter((currentItem) => String(currentItem.id) !== String(item.id)),
        );
        setSelectedItem(null);

        toast("Forgotten from your library", {
          duration: 0,
          dismissible: true,
          action: undoAction(() => void restoreForgottenItem(item)),
        });
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [canUseDesktopBackend, restoreForgottenItem, setItems, setSelectedItem, setCaptureError],
  );

  // Only the Archive tab reads the archive. Its cards show no processing state,
  // and an item opened from here fetches its own summary, so none are read here.
  useEffect(() => {
    if (!isArchiveTabOpen || shouldUseSeedLibrary()) return;
    let cancelled = false;

    async function loadArchivedItems() {
      try {
        await initializeStorage();
        const storedItems = await listArchivedItems();
        const nextItems = await Promise.all(
          storedItems.map((item) => storedItemToLibraryItem(item)),
        );
        if (!cancelled) {
          setArchivedItems(
            nextItems.map((item) => {
              const noteBody = noteBodyCacheRef.current.get(String(item.id));
              return noteBody === undefined ? item : { ...item, noteBody };
            }),
          );
          setIsArchiveLoaded(true);
        }
      } catch (error) {
        if (!cancelled) setCaptureError(error instanceof Error ? error.message : String(error));
      }
    }

    void loadArchivedItems();
    return () => {
      cancelled = true;
    };
  }, [isArchiveTabOpen, noteBodyCacheRef, setCaptureError]);

  // Each Settings session starts with the archive unread, so a list left from an
  // earlier session, including one an import read while Settings was closed, is
  // never shown as current.
  const [wasSettingsOpen, setWasSettingsOpen] = useState(isSettingsOpen);
  if (wasSettingsOpen !== isSettingsOpen) {
    setWasSettingsOpen(isSettingsOpen);
    if (isSettingsOpen) {
      setIsArchiveLoaded(shouldUseSeedLibrary());
    } else {
      setIsArchiveSelectionMode(false);
      setSelectedArchivedIds(new Set());
    }
  }

  const [prunedForItems, setPrunedForItems] = useState(archivedItems);
  if (prunedForItems !== archivedItems) {
    setPrunedForItems(archivedItems);
    const archivedIds = new Set(archivedItems.map((item) => String(item.id)));
    setSelectedArchivedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => archivedIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }

  const restoreArchivedItems = useCallback((restoredItems: LibraryItem[]) => {
    if (restoredItems.length === 0) return;
    // A settings reload can re-add a row that is still stored, so restore by
    // presence instead of blind prepending a second copy of the same item.
    setArchivedItems((current) => {
      const absent = restoredItems.filter(
        (item) => !current.some((candidate) => String(candidate.id) === String(item.id)),
      );
      return absent.length === 0 ? current : [...absent, ...current];
    });
  }, []);

  const schedulePermanentDelete = useCallback(
    (item: LibraryItem) => {
      const id = String(item.id);
      const previous = pendingPermanentDeletesRef.current.get(id);
      if (previous !== undefined) window.clearTimeout(previous.timer);
      const pending: PendingPermanentDelete = { timer: 0, item };
      pending.timer = window.setTimeout(() => {
        pendingPermanentDeletesRef.current.delete(id);
        if (!canUseDesktopBackend) return;
        void deleteItem(id)
          .then(() => {
            // The row is still in the database during the undo window, so a reload
            // can bring the card back; drop it again now the delete has landed.
            setArchivedItems((current) =>
              current.filter((candidate) => String(candidate.id) !== id),
            );
          })
          .catch((error) => {
            // A recovered item is no longer archived, so its delete fails on
            // purpose: leaving it out is already the desired end state and the error
            // would only confuse. An item that is still archived comes back here.
            if (itemsRef.current.some((candidate) => String(candidate.id) === id)) return;
            restoreArchivedItems([item]);
            setCaptureError(error instanceof Error ? error.message : String(error));
          });
      }, 10000);
      pendingPermanentDeletesRef.current.set(id, pending);
    },
    [canUseDesktopBackend, restoreArchivedItems, itemsRef, setCaptureError],
  );

  // Every delete still inside its window comes back together. A toast can be
  // replaced by a newer delete's toast, so the Undo that is on screen must cover
  // deletes it did not schedule. Delete toasts are not dismissible: notch-toast
  // closes dismissible toasts on Escape, which would drop the only Undo.
  const undoPermanentDeletes = useCallback(() => {
    const pendingDeletes = Array.from(pendingPermanentDeletesRef.current.values());
    for (const pending of pendingDeletes) cancelPermanentDelete(String(pending.item.id));
    restoreArchivedItems(pendingDeletes.map((pending) => pending.item));
  }, [cancelPermanentDelete, restoreArchivedItems]);

  useEffect(
    () => () => {
      // Unmount must not flush pending deletes: a StrictMode or HMR remount would
      // run real deletes. Dropping the timers leaves those items archived and
      // recoverable, and window close never unmounts anyway.
      for (const pending of pendingPermanentDeletesRef.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingPermanentDeletesRef.current.clear();
    },
    [],
  );

  const deleteArchivedLibraryItem = useCallback(
    (item: LibraryItem) => {
      setCaptureError(null);
      const itemId = String(item.id);
      schedulePermanentDelete(item);
      setArchivedItems((current) => current.filter((candidate) => String(candidate.id) !== itemId));
      if (selectedItem && String(selectedItem.id) === itemId) setSelectedItem(null);
      toast("Deleted permanently", {
        duration: 10000,
        action: undoAction(undoPermanentDeletes),
      });
    },
    [schedulePermanentDelete, selectedItem, undoPermanentDeletes, setSelectedItem, setCaptureError],
  );

  const toggleArchiveSelectionMode = useCallback(() => {
    setIsArchiveSelectionMode((current) => {
      if (current) setSelectedArchivedIds(new Set());
      return !current;
    });
  }, []);

  const toggleArchivedLibraryItem = useCallback((item: LibraryItem) => {
    setSelectedArchivedIds((current) => {
      const next = new Set(current);
      const id = String(item.id);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isArchivedLibraryItemSelected = useCallback(
    (item: LibraryItem) => selectedArchivedIds.has(String(item.id)),
    [selectedArchivedIds],
  );

  const restoreArchivedLibraryItems = useCallback(
    async (itemsToRestore: LibraryItem[]) => {
      if (itemsToRestore.length === 0) return;
      setCaptureError(null);
      try {
        // Restore every item first, then fetch all processing summaries in one
        // batched call instead of one round trip per restored item.
        const results = await Promise.allSettled(
          itemsToRestore.map(async (item) => {
            if (!canUseDesktopBackend) return null;
            // A restore un-archives the row, so cancel any scheduled permanent
            // delete for it before the timer can fire and destroy its assets.
            cancelPermanentDelete(String(item.id));
            return archiveItem(String(item.id), false);
          }),
        );
        const restoredStored = results.flatMap((result) =>
          result.status === "fulfilled" && result.value ? [result.value] : [],
        );
        let failures = results.filter((result) => result.status === "rejected").length;
        // One batched summaries call for the whole restore. If it fails, the
        // items are still restored; only their processing badges fall back.
        let summaries = new Map<string, ProcessingSummary>();
        try {
          if (canUseDesktopBackend && restoredStored.length > 0) {
            summaries = await getProcessingSummaries(
              restoredStored.map((storedItem) => storedItem.id),
            );
          }
        } catch {
          summaries = new Map<string, ProcessingSummary>();
        }
        // Convert per item so one unreadable item cannot sink the whole batch.
        const settled = await Promise.allSettled(
          restoredStored.map((storedItem) =>
            storedItemToLibraryItem(storedItem, summaries.get(storedItem.id)),
          ),
        );
        failures += settled.filter((result) => result.status === "rejected").length;
        const converted = settled.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const restoredItems: LibraryItem[] = [
          ...itemsToRestore.filter(() => !canUseDesktopBackend),
          ...converted,
        ];
        const restoredIds = new Set(restoredItems.map((item) => String(item.id)));
        setItems((current) => [
          ...restoredItems.filter(
            (item) => !current.some((candidate) => String(candidate.id) === String(item.id)),
          ),
          ...current,
        ]);
        setArchivedItems((current) => current.filter((item) => !restoredIds.has(String(item.id))));
        if (failures > 0)
          setCaptureError(
            `${failures} ${failures === 1 ? "item" : "items"} could not be restored. They are still in the archive.`,
          );
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : String(error));
      }
    },
    [cancelPermanentDelete, canUseDesktopBackend, setItems, setCaptureError],
  );

  const restoreSelectedArchivedItems = useCallback(async () => {
    const selectedItems = archivedItems.filter((item) => selectedArchivedIds.has(String(item.id)));
    await restoreArchivedLibraryItems(selectedItems);
    setSelectedArchivedIds(new Set());
    setIsArchiveSelectionMode(false);
  }, [archivedItems, restoreArchivedLibraryItems, selectedArchivedIds]);

  const restoreArchivedLibraryItem = useCallback(
    (item: LibraryItem) => restoreArchivedLibraryItems([item]),
    [restoreArchivedLibraryItems],
  );

  const deleteSelectedArchivedItems = useCallback(() => {
    const selectedItems = archivedItems.filter((item) => selectedArchivedIds.has(String(item.id)));
    if (selectedItems.length === 0) return;
    setCaptureError(null);
    const deletedIds = new Set(selectedItems.map((item) => String(item.id)));
    for (const item of selectedItems) schedulePermanentDelete(item);
    setArchivedItems((current) => current.filter((item) => !deletedIds.has(String(item.id))));
    if (selectedItem && deletedIds.has(String(selectedItem.id))) setSelectedItem(null);
    setSelectedArchivedIds(new Set());
    setIsArchiveSelectionMode(false);
    toast(
      `${selectedItems.length} ${selectedItems.length === 1 ? "item" : "items"} deleted permanently`,
      {
        duration: 10000,
        action: undoAction(undoPermanentDeletes),
      },
    );
  }, [
    archivedItems,
    schedulePermanentDelete,
    selectedArchivedIds,
    selectedItem,
    undoPermanentDeletes,
    setSelectedItem,
    setCaptureError,
  ]);

  return {
    archivedItems,
    setArchivedItems,
    isArchiveLoaded,
    setIsArchiveLoaded,
    isArchiveSelectionMode,
    selectedArchivedIds,
    forgetItem,
    deleteArchivedLibraryItem,
    toggleArchiveSelectionMode,
    toggleArchivedLibraryItem,
    isArchivedLibraryItemSelected,
    restoreSelectedArchivedItems,
    restoreArchivedLibraryItem,
    deleteSelectedArchivedItems,
  };
}
