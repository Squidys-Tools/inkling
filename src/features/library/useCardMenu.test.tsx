import { expect, test } from "bun:test";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import type { LibraryItem } from "../../lib/types";
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
  function Probe() {
    const controller = useCardMenu({
      canUseDesktopBackend: false,
      openReader: async () => {},
      forgetItem: async () => {},
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
    await act(async () => menu.closeCardMenu());
    expect(menu.cardMenu).toBeNull();
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
