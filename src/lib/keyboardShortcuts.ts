export type AppKeyboardShortcut = "search" | "new-note" | "help" | "sidebar";

type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing"
>;

export function appKeyboardShortcut(
  event: ShortcutEvent,
  isEditableTarget: boolean,
): AppKeyboardShortcut | null {
  if (isEditableTarget || event.altKey || event.isComposing) return null;

  if (event.ctrlKey || event.metaKey) {
    if (event.shiftKey) return null;
    if (event.key.toLowerCase() === "k") return "search";
    return event.key === "\\" ? "sidebar" : null;
  }

  if (event.key === "?" || (event.key === "/" && event.shiftKey)) return "help";
  if (event.shiftKey) return null;
  if (event.key === "/") return "search";
  if (event.key.toLowerCase() === "n") return "new-note";
  return null;
}

export function modifierKeyLabel() {
  return typeof navigator !== "undefined" && /Macintosh/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}
