import { expect, test } from "bun:test";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import type { LibraryItem } from "../../lib/types";
import type { StoredSpace } from "../../lib/libraryApi";
import { installTestDom } from "../testDom";
import { useCardMenu } from "./useCardMenu";

test("keyboard menus anchor to their card while context clicks keep their pointer coordinates", async () => {
  const { window: dom, restore } = installTestDom();
  const item = {
    id: "note",
    kind: "Note",
    title: "Known note",
    tags: [],
  } as unknown as LibraryItem;
  let menu!: ReturnType<typeof useCardMenu>;
  let activeSpace: StoredSpace | null = null;
  const spaces = ["Coding", "Other coding"].map((name, index) => ({
    id: `space-${index}`,
    name,
    kind: "smart" as const,
    query: {},
    color: "blue" as const,
    position: index,
    createdAt: 0,
    updatedAt: 0,
  }));
  const changes: string[] = [];
  function Probe() {
    const controller = useCardMenu({
      canUseDesktopBackend: false,
      openReader: async () => {},
      forgetItem: async () => {},
      activeSpace,
      spaces,
      localSpaceExclusions: new Map([[spaces[1].id, new Set([String(item.id)])]]),
      changeSpaceItem: async (space, itemId, restore) => {
        changes.push(`${space.id}:${itemId}:${restore}`);
      },
    });
    useLayoutEffect(() => {
      menu = controller;
    }, [controller]);
    return (
      <button
        type="button"
        onContextMenu={(event) => controller.openCardMenu(item, event)}
        onKeyDown={(event) => controller.openCardMenu(item, event)}
      />
    );
  }
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(<Probe />));
    const card = document.querySelector("button")!;
    Object.assign(card, {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 240, height: 180 }),
    });
    const keyboard = new dom.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(keyboard, { key: "ContextMenu" });
    await act(async () => {
      card.dispatchEvent(keyboard);
    });
    expect([menu.cardMenu?.x, menu.cardMenu?.y]).toEqual([116, 216]);
    expect(menu.cardMenuEntries.map((entry) => entry.label)).toContain("Archive");
    const pointer = new dom.Event("contextmenu", { bubbles: true, cancelable: true });
    Object.assign(pointer, { clientX: 310, clientY: 270 });
    await act(async () => {
      card.dispatchEvent(pointer);
    });
    expect([menu.cardMenu?.x, menu.cardMenu?.y]).toEqual([310, 270]);
    activeSpace = spaces[0];
    await act(async () => root.render(<Probe />));
    expect(menu.cardMenuEntries.map((entry) => entry.label)).toContain("Remove from Coding");
    expect(menu.cardMenuEntries.map((entry) => entry.label)).toContain("Allow in Other coding");
    await act(async () =>
      menu.cardMenuEntries.find((e) => e.label === "Remove from Coding")!.onSelect(),
    );
    await act(async () =>
      menu.cardMenuEntries.find((e) => e.label === "Allow in Other coding")!.onSelect(),
    );
    expect(changes).toEqual(["space-0:note:false", "space-1:note:true"]);
    await act(async () => menu.closeCardMenu());
    expect(menu.cardMenu).toBeNull();
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
