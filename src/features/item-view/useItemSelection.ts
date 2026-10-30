import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { gsap } from "gsap";
import {
  findCard,
  isCardTooFarOffscreen,
  prefersReducedMotion,
  queryCardRects,
  scrollViewport,
  scrollViewportRect,
  type SourceRects,
} from "./overlayMotion";
import type { LibraryItem } from "../../lib/types";

type ItemSelectionOptions = {
  libraryScrollRef: RefObject<HTMLDivElement | null>;
  captureBarRef: RefObject<HTMLElement | null>;
  filteredItemsRef: RefObject<LibraryItem[]>;
  selectedItem: LibraryItem | null;
  setSelectedItem: Dispatch<SetStateAction<LibraryItem | null>>;
};

export function useItemSelection({
  libraryScrollRef,
  captureBarRef,
  filteredItemsRef,
  selectedItem,
  setSelectedItem,
}: ItemSelectionOptions) {
  const selectionRectsRef = useRef<SourceRects | null>(null);
  const selectionRunRef = useRef(0);
  const selectionScrollRef = useRef(false);

  const selectLibraryItem = useCallback(
    (item: LibraryItem, rects?: SourceRects) => {
      const run = ++selectionRunRef.current;
      const sourceRects = rects ?? queryCardRects(item.id);
      const contentArea = libraryScrollRef.current;
      const scrollElement = scrollViewport(contentArea);
      if (
        !sourceRects ||
        !scrollElement ||
        !isCardTooFarOffscreen(
          sourceRects.card,
          scrollViewportRect(scrollElement, captureBarRef.current),
        )
      ) {
        selectionScrollRef.current = false;
        selectionRectsRef.current = sourceRects;
        setSelectedItem(item);
        return;
      }

      const viewportRect = scrollViewportRect(scrollElement, captureBarRef.current);
      const nextScrollTop = Math.max(
        0,
        scrollElement.scrollTop + sourceRects.card.top - viewportRect.top - 16,
      );
      selectionScrollRef.current = true;

      // The card is scrolled into view with an eased, smooth motion before the
      // overlay opens, so its rect is measured only once the scroll settles.
      const finish = () => {
        if (run !== selectionRunRef.current) return;
        selectionRectsRef.current = queryCardRects(item.id) ?? sourceRects;
        setSelectedItem(item);
        selectionScrollRef.current = false;
      };

      if (prefersReducedMotion()) {
        scrollElement.scrollTop = nextScrollTop;
        finish();
        return;
      }

      gsap.to(scrollElement, {
        scrollTop: nextScrollTop,
        duration: 0.55,
        ease: "power2.inOut",
        overwrite: true,
        onComplete: finish,
      });
    },
    [libraryScrollRef, setSelectedItem, captureBarRef],
  );

  const bringHistoryCardIntoView = useCallback(
    (item: LibraryItem, candidates: LibraryItem[]) =>
      new Promise<SourceRects | null>((resolve) => {
        const index = candidates.findIndex((candidate) => candidate.id === item.id);
        const contentArea = libraryScrollRef.current;
        const scrollElement = scrollViewport(contentArea);
        if (index < 0 || !scrollElement) {
          resolve(null);
          return;
        }

        const viewportRect = scrollViewportRect(scrollElement, captureBarRef.current);
        let rects = queryCardRects(item.id);
        if (!rects || isCardTooFarOffscreen(rects.card, viewportRect)) {
          if (rects) {
            scrollElement.scrollTop += rects.card.top - viewportRect.top - 16;
          } else {
            const maxScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
            scrollElement.scrollTop = maxScroll * (index / Math.max(1, candidates.length - 1));
          }
        }

        let frames = 0;
        const waitForCard = () => {
          rects = queryCardRects(item.id);
          if (rects) {
            const currentViewport = scrollViewportRect(scrollElement, captureBarRef.current);
            if (isCardTooFarOffscreen(rects.card, currentViewport)) {
              // At either end of the list the scroll can't move, so take the card
              // where it is rather than waiting forever (Back would never close).
              const before = scrollElement.scrollTop;
              scrollElement.scrollTop += rects.card.top - currentViewport.top - 16;
              if (scrollElement.scrollTop !== before) {
                requestAnimationFrame(waitForCard);
                return;
              }
            }
            resolve(rects);
            return;
          }
          if (++frames >= 8) {
            resolve(null);
            return;
          }
          requestAnimationFrame(waitForCard);
        };
        requestAnimationFrame(waitForCard);
      }),
    [libraryScrollRef, captureBarRef],
  );

  const selectArchivedLibraryItem = useCallback(
    (item: LibraryItem, rects?: SourceRects) => {
      selectionScrollRef.current = false;
      selectionRectsRef.current = rects ?? null;
      setSelectedItem(item);
    },
    [setSelectedItem],
  );

  // Opening a similar item is a history step like any other, so it goes through
  // the same card-into-view path history uses.
  const openSimilarItem = useCallback(
    (item: LibraryItem) => {
      void bringHistoryCardIntoView(item, filteredItemsRef.current).then((rects) => {
        selectionScrollRef.current = false;
        selectionRectsRef.current = rects;
        setSelectedItem(item);
      });
    },
    [bringHistoryCardIntoView, setSelectedItem, filteredItemsRef],
  );

  // Selection styling stays out of the card render tree so opening the
  // overlay does not re-render (or remount embeds in) the whole grid.
  useEffect(() => {
    const selectedCards = document.querySelectorAll<HTMLElement>(".library-card.is-selected");
    for (const card of selectedCards) card.classList.remove("is-selected");
    if (!selectedItem) return;
    findCard(selectedItem.id)?.classList.add("is-selected");
  }, [selectedItem]);

  return {
    selectionRectsRef,
    selectionScrollRef,
    selectLibraryItem,
    selectArchivedLibraryItem,
    bringHistoryCardIntoView,
    openSimilarItem,
  };
}
