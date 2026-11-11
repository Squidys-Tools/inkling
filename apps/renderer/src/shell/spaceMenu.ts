import type { ContextMenuItem } from "@inkling/contracts/desktop";
import type { KeyboardEvent, MouseEvent } from "react";
import { menuPoint, showContextMenu } from "../menu/contextMenu.tsx";

export type SpaceActions = {
  up: () => void;
  down: () => void;
  color: () => void;
  rename: () => void;
  delete: () => void;
};

/** One menu for a Space, from its row's button, a right-click, or the compact rail's blot. */
export async function openSpaceMenu(
  event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>,
  name: string,
  can: { up: boolean; down: boolean },
  actions: SpaceActions,
) {
  event.preventDefault();
  const entries: ContextMenuItem[] = [
    { type: "item", id: "rename", label: "Rename" },
    { type: "item", id: "color", label: "Change color" },
    { type: "item", id: "up", label: "Move up", enabled: can.up },
    { type: "item", id: "down", label: "Move down", enabled: can.down },
    { type: "separator" },
    { type: "item", id: "delete", label: "Delete Space", destructive: true },
  ];
  const target = event.currentTarget;
  const chosen = await showContextMenu(entries, menuPoint(event), `Actions for ${name}`);
  if (target.isConnected && (!document.activeElement || document.activeElement === document.body))
    target.focus({ preventScroll: true });
  if (chosen && Object.hasOwn(actions, chosen)) actions[chosen as keyof SpaceActions]();
}

export const opensMenu = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
