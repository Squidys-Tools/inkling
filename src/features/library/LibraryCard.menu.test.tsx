import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { LibraryCard } from "./LibraryCard";
import type { LibraryItem } from "../../lib/types";
import { installTestDom } from "../testDom";

test("grid and row cards open details with click and actions with context or keyboard only", async () => {
  const { window: dom, restore } = installTestDom();
  const item = {
    id: "note",
    kind: "Note",
    title: "Known note",
    description: "",
    source: "file",
    date: "Just now",
    tags: [],
  } as LibraryItem;
  const root = createRoot(document.getElementById("root")!);
  const routes: string[] = [];
  try {
    for (const layout of ["grid", "list"] as const) {
      await act(async () =>
        root.render(
          <LibraryCard
            data={item}
            index={0}
            context={{
              layout,
              onSelectItem: () => routes.push("details"),
              onOpenReader: () => {},
              onRetryJob: () => {},
              onOpenMenu: () => routes.push("menu"),
            }}
          />,
        ),
      );
      const card = document.querySelector("article")!;
      const rect = () => ({ left: 0, top: 0, width: 240, height: 180 });
      Object.assign(card, { getBoundingClientRect: rect });
      Object.assign(card.querySelector(".library-card-media")!, { getBoundingClientRect: rect });
      expect(card.querySelector("button")).toBeNull();
      for (const type of ["click", "contextmenu"])
        await act(async () => {
          card.dispatchEvent(new dom.Event(type, { bubbles: true, cancelable: true }));
        });
      for (const [key, shiftKey] of [
        ["F10", true],
        ["ContextMenu", false],
      ] as const) {
        const event = new dom.Event("keydown", { bubbles: true, cancelable: true });
        Object.assign(event, { key, shiftKey });
        await act(async () => {
          card.dispatchEvent(event);
        });
      }
    }
    expect(routes).toEqual(["details", "menu", "menu", "menu", "details", "menu", "menu", "menu"]);
  } finally {
    await act(async () => root.unmount());
    restore();
  }
});
