import { useEffect, useRef, type RefObject } from "react";
import { scrollViewport } from "./overlayMotion";

export function LibraryBottomFade({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const fadeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    const fade = fadeRef.current;
    if (!root || !fade) return;

    const update = () => {
      const viewport = scrollViewport(root);
      if (!viewport) return;
      const atEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2;
      fade.toggleAttribute("data-at-end", atEnd);
    };
    const onScroll = (event: Event) => {
      if (event.target === scrollViewport(root)) update();
    };

    update();
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    const observer = new MutationObserver(update);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    return () => {
      root.removeEventListener("scroll", onScroll, { capture: true });
      observer.disconnect();
    };
  }, [scrollRef]);

  return (
    <div ref={fadeRef} className="library-bottom-fade" aria-hidden="true">
      <span />
    </div>
  );
}
