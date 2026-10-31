import { useEffect, useEffectEvent } from "react";

const editable = (target: Element) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

/**
 * Runs `onEscape` when Escape reaches the window. A control that owns its Escape
 * prevents the default, an open menu closes first, and a field outside the page
 * (marked by `data-escape-scope`) keeps its Escape, so one press closes one thing.
 */
export function useEscape(onEscape: () => void) {
  const run = useEffectEvent(onEscape);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest('[role="menu"]')) return;
        if (editable(target) && !target.closest("[data-escape-scope]")) return;
      }
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
