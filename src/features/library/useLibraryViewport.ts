import { useLayoutEffect, type RefObject } from "react";

export function useLibraryViewport(
  scrollRef: RefObject<HTMLDivElement | null>,
  chromeRef: RefObject<HTMLElement | null>,
  dockRef: RefObject<HTMLDivElement | null>,
) {
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const chrome = chromeRef.current;
    const dock = dockRef.current;
    const parent = scroll?.parentElement;
    if (!scroll || !chrome || !dock || !parent) return;
    const update = () => {
      const box = parent.getBoundingClientRect();
      // Clip the scrolling cards, not just the first row, outside the live chrome.
      scroll.style.top = `${Math.max(0, chrome.getBoundingClientRect().bottom - box.top + 12)}px`;
      // An empty dock (toggle hidden) reserves nothing.
      const dockInset = dock.offsetHeight ? box.bottom - dock.getBoundingClientRect().top + 12 : 0;
      scroll.style.bottom = `${Math.max(16, dockInset)}px`;
    };
    const observer = new ResizeObserver(update);
    for (const node of [chrome, dock, parent]) observer.observe(node);
    update();
    return () => {
      observer.disconnect();
      scroll.style.removeProperty("top");
      scroll.style.removeProperty("bottom");
    };
  }, [scrollRef, chromeRef, dockRef]);
}
