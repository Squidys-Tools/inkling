import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { deleteItem } from "../../lib/libraryApi";
import type { LibraryItem } from "../../lib/types";
import { errorMessage } from "../errorMessage";

// One accepted archive delete: the timer waiting out the undo window, plus the
// item that timer needs to restore or reconcile if the delete does not land.
type PendingPermanentDelete = {
  timer: number;
  item: LibraryItem;
};

// Holds each archive delete for its undo window before it reaches the backend.
export function usePermanentDeletes({
  canUseDesktopBackend,
  itemsRef,
  setArchivedItems,
  setCaptureError,
}: {
  canUseDesktopBackend: boolean;
  itemsRef: RefObject<LibraryItem[]>;
  setArchivedItems: Dispatch<SetStateAction<LibraryItem[]>>;
  setCaptureError: Dispatch<SetStateAction<string | null>>;
}) {
  const pendingPermanentDeletesRef = useRef<Map<string, PendingPermanentDelete>>(new Map());

  const cancelPermanentDelete = useCallback((pending: PendingPermanentDelete) => {
    const id = String(pending.item.id);
    // Only the toast that scheduled a deletion may cancel it. Deleting the same
    // item again stores a new record, and that older Undo has to stay a no-op.
    if (pendingPermanentDeletesRef.current.get(id) !== pending) return false;
    window.clearTimeout(pending.timer);
    pendingPermanentDeletesRef.current.delete(id);
    return true;
  }, []);

  const restoreArchivedItems = useCallback(
    (restoredItems: LibraryItem[]) => {
      if (restoredItems.length === 0) return;
      // A settings reload can re-add a row that is still stored, so restore by
      // presence instead of blind prepending a second copy of the same item.
      setArchivedItems((current) => {
        const absent = restoredItems.filter(
          (item) => !current.some((candidate) => String(candidate.id) === String(item.id)),
        );
        return absent.length === 0 ? current : [...absent, ...current];
      });
    },
    [setArchivedItems],
  );

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
            setCaptureError(errorMessage(error));
          });
      }, 10000);
      pendingPermanentDeletesRef.current.set(id, pending);
      return pending;
    },
    [canUseDesktopBackend, restoreArchivedItems, itemsRef, setArchivedItems, setCaptureError],
  );

  const undoPermanentDelete = useCallback(
    (pendingDeletes: PendingPermanentDelete[]) => {
      const restored = pendingDeletes
        .filter((pending) => cancelPermanentDelete(pending))
        .map((pending) => pending.item);
      restoreArchivedItems(restored);
    },
    [cancelPermanentDelete, restoreArchivedItems],
  );

  // A restore un-archives the row, so its scheduled delete must not fire and
  // destroy the assets.
  const cancelPendingDelete = useCallback(
    (id: string) => {
      const pending = pendingPermanentDeletesRef.current.get(id);
      if (pending !== undefined) cancelPermanentDelete(pending);
    },
    [cancelPermanentDelete],
  );

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

  return { schedulePermanentDelete, undoPermanentDelete, cancelPendingDelete };
}
