import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { SourceRects } from "../item-view/overlayMotion";
import type { LibraryItem } from "../../lib/types";

type NavSnapshot = {
  view: string;
  spaceId: string | null;
  query: string;
  itemId: string | null;
};

type HistoryOptions = {
  activeView: string;
  activeSpaceId: string | null;
  query: string;
  selectedItem: LibraryItem | null;
  items: LibraryItem[];
  archivedItems: LibraryItem[];
  similarItemCacheRef: RefObject<Map<string, LibraryItem>>;
  filteredItemsRef: RefObject<LibraryItem[]>;
  selectionRectsRef: RefObject<SourceRects | null>;
  selectionScrollRef: RefObject<boolean>;
  bringHistoryCardIntoView: (
    item: LibraryItem,
    candidates: LibraryItem[],
  ) => Promise<SourceRects | null>;
  selectArchivedLibraryItem: (item: LibraryItem, rects?: SourceRects) => void;
  setActiveView: Dispatch<SetStateAction<string>>;
  setActiveSpaceId: Dispatch<SetStateAction<string | null>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
};

export function useHistory({
  activeView,
  activeSpaceId,
  query,
  selectedItem,
  items,
  archivedItems,
  similarItemCacheRef,
  filteredItemsRef,
  selectionRectsRef,
  selectionScrollRef,
  bringHistoryCardIntoView,
  selectArchivedLibraryItem,
  setActiveView,
  setActiveSpaceId,
  setQuery,
  setSelectedItem,
}: HistoryOptions) {
  const selectedItemId = selectedItem ? String(selectedItem.id) : null;
  // In-memory back/forward history over view, search query, and open item.
  // Query changes commit after a pause so typing does not add an entry per key.
  const historyRef = useRef<{ entries: NavSnapshot[]; index: number }>({ entries: [], index: 0 });
  const restoringNavKeyRef = useRef<string | null>(null);
  const pendingHistoryCloseRef = useRef<{ target: NavSnapshot; index: number } | null>(null);
  const [historyCloseRequest, setHistoryCloseRequest] = useState(0);
  const navSnapshot: NavSnapshot = {
    view: activeView,
    spaceId: activeSpaceId,
    query,
    itemId: selectedItemId,
  };
  const navKey = JSON.stringify(navSnapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: navKey encodes the snapshot
  useEffect(() => {
    const restoringNavKey = restoringNavKeyRef.current;
    if (restoringNavKey) {
      if (restoringNavKey === navKey) restoringNavKeyRef.current = null;
      return;
    }
    const history = historyRef.current;
    const current = history.entries[history.index];
    if (current && JSON.stringify(current) === navKey) return;
    const commit = () => {
      history.entries.splice(history.index + 1, history.entries.length, navSnapshot);
      history.index = history.entries.length - 1;
    };
    if (!current || current.query === navSnapshot.query) {
      commit();
      return;
    }
    const timer = window.setTimeout(() => {
      if (restoringNavKeyRef.current || history.entries[history.index] !== current) return;
      commit();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [navKey]);

  const stepHistory = useCallback(
    (delta: -1 | 1) => {
      const history = historyRef.current;
      const target = history.entries[history.index + delta];
      if (!target) return;
      // Similar items are not always in the grid's list, so a step back to one
      // falls back to the copy the Similar lookup kept.
      const item = target.itemId
        ? ([...items, ...archivedItems].find(
            (candidate) => String(candidate.id) === target.itemId,
          ) ?? similarItemCacheRef.current.get(target.itemId))
        : undefined;
      // A vanished item restores as a closed overlay; keep the stack in step so it is not re-pushed.
      if (target.itemId && !item) target.itemId = null;
      restoringNavKeyRef.current = JSON.stringify(target);
      if (!target.itemId && selectedItem) {
        pendingHistoryCloseRef.current = { target, index: history.index + delta };
        setActiveSpaceId(target.spaceId);
        setActiveView(target.view);
        setQuery(target.query);
        requestAnimationFrame(() => {
          void bringHistoryCardIntoView(selectedItem, filteredItemsRef.current).then((rects) => {
            selectionRectsRef.current = rects;
            setHistoryCloseRequest((request) => request + 1);
          });
        });
        return;
      }
      history.index += delta;
      selectionScrollRef.current = false;
      selectionRectsRef.current = null;
      setActiveSpaceId(target.spaceId);
      setActiveView(target.view);
      setQuery(target.query);
      if (item?.archived) selectArchivedLibraryItem(item);
      else if (item) {
        requestAnimationFrame(() => {
          void bringHistoryCardIntoView(item, filteredItemsRef.current).then((rects) => {
            selectionRectsRef.current = rects;
            setSelectedItem(item);
          });
        });
      } else setSelectedItem(null);
    },
    [
      archivedItems,
      bringHistoryCardIntoView,
      items,
      selectArchivedLibraryItem,
      selectedItem,
      filteredItemsRef,
      setActiveSpaceId,
      setActiveView,
      selectionScrollRef,
      similarItemCacheRef,
      selectionRectsRef,
      setSelectedItem,
      setQuery,
    ],
  );
  const stepHistoryRef = useRef(stepHistory);
  stepHistoryRef.current = stepHistory;
  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      stepHistoryRef.current(event.button === 3 ? -1 : 1);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      stepHistoryRef.current(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const closeItem = useCallback(() => {
    const pending = pendingHistoryCloseRef.current;
    if (!pending) {
      setSelectedItem(null);
      return;
    }
    pendingHistoryCloseRef.current = null;
    const history = historyRef.current;
    history.index = pending.index;
    selectionScrollRef.current = false;
    selectionRectsRef.current = null;
    setActiveSpaceId(pending.target.spaceId);
    setActiveView(pending.target.view);
    setQuery(pending.target.query);
    setSelectedItem(null);
  }, [
    setSelectedItem,
    selectionScrollRef,
    setActiveSpaceId,
    setQuery,
    setActiveView,
    selectionRectsRef,
  ]);

  return { historyCloseRequest, closeItem };
}
