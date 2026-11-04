import { useHotkey } from "@tanstack/react-hotkeys";

const editable = (target: Element) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches("input, textarea, select"));

/**
 * Runs `onEscape` on Escape. A control that owns its Escape prevents the
 * default, an open menu closes first, and a field outside the page (marked by
 * `data-escape-scope`) keeps its Escape, so one press closes one thing.
 */
export function useEscape(onEscape: () => void) {
  useHotkey(
    "Escape",
    (event) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest('[role="menu"]')) return;
        // An open dialog keeps its own Escape.
        if (
          document.querySelector(
            '[role="dialog"]:not([aria-modal="false"]), [role="alertdialog"]:not([aria-modal="false"])',
          )
        )
          return;
        if (editable(target) && !target.closest("[data-escape-scope]")) return;
      }
      event.preventDefault();
      onEscape();
    },
    // On window, after document listeners such as Base UI's dismiss, so their preventDefault
    // is seen. The callback prevents only what it acts on: the library's own preventDefault
    // would run first and make the callback read its own press as handled.
    { target: window, preventDefault: false },
  );
}
