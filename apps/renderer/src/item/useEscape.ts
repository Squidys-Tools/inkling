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
    // Only an Escape this page acts on is prevented; the rest still reach menus and fields.
    { preventDefault: false },
  );
}
