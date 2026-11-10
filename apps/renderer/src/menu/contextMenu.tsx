import type { ContextMenuItem } from "@inkling/contracts/desktop";
import { createAtom, useSelector } from "@tanstack/react-store";
import { lazy, Suspense } from "react";

export type OpenMenu = {
  items: ContextMenuItem[];
  x: number;
  y: number;
  returnFocus: HTMLElement | null;
  resolve: (id: string | null) => void;
};

const openMenu = createAtom<OpenMenu | null>(null);

const loadMenu = () => import("./OpenContextMenu.tsx");
const OpenContextMenu = lazy(() =>
  loadMenu().then((module) => ({ default: module.OpenContextMenu })),
);

/** Fetches the menu's code ahead of the first right-click, which would otherwise wait on it. */
export const preloadContextMenu = () => void loadMenu();

/** Native and preview share presentation; callers retain their real action APIs. */
export function showContextMenu(items: ContextMenuItem[], at: { x: number; y: number }) {
  openMenu.get()?.resolve(null);
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  return new Promise<string | null>((resolve) =>
    openMenu.set({ items, ...at, returnFocus, resolve }),
  );
}

export function closeContextMenu(menu: OpenMenu, id: string | null) {
  // A replaced menu's delayed dismissal must not settle the newer menu.
  if (openMenu.get() !== menu) return;
  openMenu.set(null);
  menu.resolve(id);
}

export function menuPoint(event: { clientX?: number; clientY?: number; currentTarget: Element }) {
  if (event.clientX || event.clientY) return { x: event.clientX ?? 0, y: event.clientY ?? 0 };
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: rect.left + 16, y: rect.top + 16 };
}

export function ContextMenuLayer() {
  const menu = useSelector(openMenu);
  return menu ? (
    <Suspense>
      <OpenContextMenu menu={menu} />
    </Suspense>
  ) : null;
}
