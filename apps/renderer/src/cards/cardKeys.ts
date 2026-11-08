import type { KeyboardEvent } from "react";

/**
 * The keyboard contract every card surface shares: events bubbling from descendants are
 * ignored, ContextMenu or Shift+F10 opens the card menu, and Enter or Space opens the item.
 */
export function cardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  { onOpen, onMenu }: { onOpen: () => void; onMenu: (event: KeyboardEvent<HTMLElement>) => void },
) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) return onMenu(event);
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onOpen();
}
