import { gsap } from "gsap";
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../item-view/overlayMotion";

export const LIBRARY_VIEW_TRANSITION_MS = 440;

// Mirrors `.library-grid` gap and the Paper column width (artboard 1.1). Virtuoso
// lays columns out in a flex row, so the CSS gap is the real column gap.
const GRID_GAP = 12;
const TARGET_CARD_WIDTH = 286;
const MAX_GRID_COLUMNS = 12;

function masonryColumnCount(width: number): number {
  const columns = Math.round((width + GRID_GAP) / (TARGET_CARD_WIDTH + GRID_GAP));
  return Math.min(Math.max(columns, 1), MAX_GRID_COLUMNS);
}

export function useLibraryView(libraryScrollRef: RefObject<HTMLDivElement | null>) {
  const [listMode, setListMode] = useState(false);
  const [viewSelectionListMode, setViewSelectionListMode] = useState(false);
  const libraryViewAnimationRef = useRef<gsap.core.Animation | null>(null);
  const libraryViewEnteringRef = useRef(false);
  const libraryViewTransitionRunRef = useRef(0);
  const [libraryViewportWidth, setLibraryViewportWidth] = useState(() =>
    typeof window === "undefined" ? 960 : window.innerWidth,
  );

  // Only cards in view animate; the rest stay hidden until the entrance ends.
  const playLibraryEntrance = useCallback(
    (list: boolean) => {
      const root = libraryScrollRef.current;
      const grid = root?.querySelector<HTMLElement>(".library-grid");
      if (!root || !grid) return;
      const run = ++libraryViewTransitionRunRef.current;
      grid.dataset.entering = "";
      gsap.set(grid, { clearProps: "opacity" });
      // Virtuoso mounts and measures the new layout over the next frames.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (run !== libraryViewTransitionRunRef.current) return;
          const view = root.getBoundingClientRect();
          const cards: HTMLElement[] = [];
          const delays: number[] = [];
          for (const card of grid.querySelectorAll<HTMLElement>(".library-card")) {
            const rect = card.getBoundingClientRect();
            if (rect.bottom <= view.top || rect.top >= view.bottom) continue;
            const down = Math.max(0, rect.top - view.top) / view.height;
            const across = Math.max(0, rect.left - view.left) / view.width;
            cards.push(card);
            delays.push(list ? down * 0.28 : (down + across) * 0.2);
          }
          const finish = () => {
            delete grid.dataset.entering;
            gsap.set(cards, { clearProps: "opacity,transform" });
          };
          libraryViewAnimationRef.current = gsap.fromTo(
            cards,
            list ? { opacity: 0, y: -6 } : { opacity: 0, scale: 0.96 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.3,
              ease: "power2.out",
              delay: (index: number) => delays[index] ?? 0,
              onComplete: finish,
              onInterrupt: finish,
            },
          );
        }),
      );
    },
    [libraryScrollRef],
  );

  const switchLibraryView = useCallback(
    (nextListMode: boolean) => {
      if (nextListMode === viewSelectionListMode) return;
      setViewSelectionListMode(nextListMode);
      libraryViewTransitionRunRef.current += 1;
      libraryViewAnimationRef.current?.kill();
      const grid = libraryScrollRef.current?.querySelector<HTMLElement>(".library-grid");
      if (!grid || prefersReducedMotion()) {
        if (grid) gsap.set(grid, { clearProps: "opacity" });
        setListMode(nextListMode);
        return;
      }
      libraryViewAnimationRef.current = gsap.to(grid, {
        opacity: 0,
        duration: 0.16,
        ease: "power1.in",
        onComplete: () => {
          // Back to the view already showing: nothing re-renders, so pop it in here.
          if (nextListMode === listMode) playLibraryEntrance(nextListMode);
          else {
            libraryViewEnteringRef.current = true;
            setListMode(nextListMode);
          }
        },
      });
    },
    [listMode, playLibraryEntrance, viewSelectionListMode, libraryScrollRef],
  );

  useLayoutEffect(() => {
    if (!libraryViewEnteringRef.current) return;
    libraryViewEnteringRef.current = false;
    playLibraryEntrance(listMode);
  }, [listMode, playLibraryEntrance]);

  useEffect(
    () => () => {
      libraryViewAnimationRef.current?.kill();
    },
    [],
  );

  useEffect(() => {
    const element = libraryScrollRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.clientWidth;
      if (nextWidth > 0)
        setLibraryViewportWidth((current) => (current === nextWidth ? current : nextWidth));
    };
    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(updateWidth);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [libraryScrollRef]);

  const gridColumnCount = masonryColumnCount(libraryViewportWidth);

  return { listMode, viewSelectionListMode, switchLibraryView, gridColumnCount };
}
