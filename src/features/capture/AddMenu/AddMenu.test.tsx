import { expect, test } from "bun:test";
import { act, useState } from "react";
import { mountInTestDom } from "../../testDom";
import { AddMenu } from "./AddMenu";

const noop = () => {};

test("Compact Add toggles in place, exposes all six actions and forwards form and capture actions", async () => {
  const selected: string[] = [];
  function Probe() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<"note" | "url" | "quote" | null>(null);
    return (
      <AddMenu
        compact
        collapsible
        open={open}
        mode={mode}
        saving={false}
        error={null}
        onOpen={() => setOpen(true)}
        onClose={() => {
          setOpen(false);
          setMode(null);
        }}
        onModeChange={setMode}
        onSaveNote={async () => true}
        onSaveLink={async () => true}
        onSaveQuote={async () => true}
        onPickFile={() => selected.push("file")}
        onScreenshot={() => {
          selected.push("screen");
          setOpen(false);
        }}
        onAddSpace={() => selected.push("space")}
      />
    );
  }
  await mountInTestDom(<Probe />, async (doc) => {
    const trigger = () => doc.querySelector<HTMLButtonElement>('[aria-label="Add"]')!;
    await act(async () => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(doc.querySelectorAll(".compact-add-option")).toHaveLength(6);
    expect(
      [...doc.querySelectorAll(".compact-add-option")].map((e) => e.getAttribute("aria-label")),
    ).toEqual(["Note", "Link", "Quote", "File", "Screenshot", "Space"]);
    expect(doc.querySelector('[aria-label="Space"]')?.getAttribute("data-tooltip")).toBe("Space");
    expect(doc.querySelector('[aria-label="Add space"]')).toBeNull();
    for (const [label, field] of [
      ["Note", "New note"],
      ["Link", "URL to save"],
      ["Quote", "Quote text"],
    ]) {
      await act(async () =>
        doc.querySelector<HTMLButtonElement>(`.compact-add-option[aria-label="${label}"]`)!.click(),
      );
      expect(doc.querySelector(`[aria-label="${field}"]`)).not.toBeNull();
      expect(doc.querySelector(".compact-add-stack")?.hasAttribute("inert")).toBe(true);
      await act(async () => doc.querySelector<HTMLButtonElement>('[aria-label="Back"]')!.click());
    }
    await act(async () => trigger().click());
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await act(async () => trigger().click());
    await act(async () =>
      doc.querySelector<HTMLButtonElement>('[aria-label="Screenshot"]')!.click(),
    );
    await act(async () => trigger().click());
    await act(async () => doc.querySelector<HTMLButtonElement>('[aria-label="Space"]')!.click());
    expect(selected).toEqual(["screen", "space"]);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});

test("Expanded Add names the folder action Space without changing its handler", async () => {
  const selected: string[] = [];
  await mountInTestDom(
    <AddMenu
      collapsible
      open
      mode={null}
      saving={false}
      error={null}
      onOpen={noop}
      onClose={() => selected.push("close")}
      onModeChange={noop}
      onSaveNote={async () => true}
      onSaveLink={async () => true}
      onSaveQuote={async () => true}
      onPickFile={noop}
      onScreenshot={noop}
      onAddSpace={() => selected.push("space")}
    />,
    async (doc) => {
      const space = doc.querySelector<HTMLButtonElement>('.add-menu-tile[aria-label="Space"]')!;
      expect(space.textContent).toBe("Space");
      expect(space.getAttribute("data-tooltip")).toBe("Space");
      expect(doc.querySelector('[aria-label="Add space"]')).toBeNull();
      await act(async () => space.click());
      expect(selected).toEqual(["close", "space"]);
    },
  );
});

test("Collapsed Codex Space action reopens the sidebar and returns Add to tiles", async () => {
  function Probe() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [open, setOpen] = useState(false);
    return (
      <AddMenu
        collapsible
        compact={!sidebarOpen}
        open={open}
        mode={null}
        saving={false}
        error={null}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        onModeChange={noop}
        onSaveNote={async () => true}
        onSaveLink={async () => true}
        onSaveQuote={async () => true}
        onPickFile={noop}
        onScreenshot={noop}
        onAddSpace={() => setSidebarOpen(true)}
      />
    );
  }
  await mountInTestDom(<Probe />, async (doc) => {
    const trigger = () => doc.querySelector<HTMLButtonElement>('[aria-label="Add"]')!;
    await act(async () => trigger().click());
    expect(doc.querySelectorAll(".compact-add-option")).toHaveLength(6);
    await act(async () => doc.querySelector<HTMLButtonElement>('[aria-label="Space"]')!.click());
    expect(doc.querySelector(".compact-add-option")).toBeNull();
    await act(async () => trigger().click());
    expect(doc.querySelectorAll(".add-menu-tile")).toHaveLength(6);
    expect(doc.querySelector(".compact-add-option")).toBeNull();
  });
});
