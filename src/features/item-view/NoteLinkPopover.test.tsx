import { expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { installTestDom } from "../testDom";
import { NoteLinkPopover } from "./NoteLinkPopover";

test("the link field selects its URL once on open, not on every keystroke", async () => {
  const { window: dom, restore } = installTestDom();
  let selects = 0;
  const prototype = dom.HTMLElement.prototype;
  Object.assign(prototype, { select: () => selects++ });
  const popover = (draft: string) => (
    <NoteLinkPopover
      draft={draft}
      canRemove={false}
      onDraftChange={() => {}}
      onApply={() => {}}
      onRemove={() => {}}
    />
  );
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(popover("h")));
    await act(async () => root.render(popover("ht")));
    await act(async () => root.render(popover("htt")));
    expect(selects).toBe(1);
  } finally {
    await act(async () => root.unmount());
    Reflect.deleteProperty(prototype, "select");
    restore();
  }
});
