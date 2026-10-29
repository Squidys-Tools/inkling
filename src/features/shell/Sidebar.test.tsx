import { expect, test } from "bun:test";
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { Sidebar } from "./Sidebar";
import { SpacesSection } from "./SpacesSection";
import { APPEARANCE_OPTIONS } from "../settings/appearance";
import { AddMenu } from "../capture/AddMenu/AddMenu";

const noop = () => {};
async function mounted(content: ReactNode, check: (doc: Document) => void | Promise<void>) {
  const { window: dom } = parseHTML("<html><body><div id='root'></div></body></html>");
  for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    SVGElement: dom.SVGElement,
    Node: dom.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  }))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(content));
    await check(document);
  } finally {
    await act(async () => root.unmount());
  }
}
function sidebar(experimental: boolean, isOpen: boolean) {
  return (
    <Sidebar
      experimental={experimental}
      isOpen={isOpen}
      edgeToggle={false}
      isSearchFocused={false}
      everything={{ active: true, count: 10, onSelect: noop }}
      onClose={noop}
      onOpen={noop}
      footer={<button aria-label="Settings">Settings</button>}
    >
      <div>Spaces</div>
    </Sidebar>
  );
}

test("Codex collapse retains navigation and only the collapsed mascot reopens the brand", async () => {
  await mounted(sidebar(true, false), (doc) => {
    const aside = doc.querySelector("aside")!;
    expect(aside.hasAttribute("inert")).toBe(false);
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(doc.querySelector('[aria-label="Open sidebar"]')?.tagName).toBe("BUTTON");
    expect(doc.querySelector('[aria-label="Open sidebar"] svg')).not.toBeNull();
    expect(doc.querySelector('[aria-label="Everything"]')).not.toBeNull();
    expect(doc.querySelector('[aria-label="Close sidebar"]')?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector('[role="separator"]')).toBeNull();
  });
  await mounted(sidebar(true, true), (doc) =>
    expect(doc.querySelector('[aria-label="Open sidebar"]')).toBeNull(),
  );
});

test("Classic retains hidden collapse and stays the default appearance choice", async () => {
  await mounted(sidebar(false, false), (doc) => {
    expect(doc.querySelector("aside")?.hasAttribute("inert")).toBe(true);
    expect(doc.querySelector(".codex-sidebar")).toBeNull();
    expect(doc.querySelector(".codex-mascot-open")).toBeNull();
    expect(APPEARANCE_OPTIONS.sidebarStyle[0].value).toBe("classic");
  });
});

test("Collapsed Codex keeps every named Space selectable with its colour and active state", async () => {
  const spaces = ["Notes", "Research", "Images"].map((name, index) => ({
    id: `space-${index}`,
    name,
    color: "blue" as const,
    kind: "regular" as const,
    query: {},
    position: index,
    createdAt: 0,
    updatedAt: 0,
  }));
  const selections: string[] = [];
  await mounted(
    <SpacesSection
      experimental
      collapsed
      spaces={spaces}
      activeSpaceId="space-1"
      activeCount={0}
      renaming={{ id: null, draft: "", setDraft: noop, inputRef: { current: null } }}
      actions={{
        select: (space) => selections.push(space.id),
        cycleColor: noop,
        move: noop,
        startRename: noop,
        rename: noop,
        cancelRename: noop,
        remove: noop,
      }}
      draft={{
        isOpen: false,
        name: "",
        kind: "regular",
        query: "",
        toggle: noop,
        setName: noop,
        setKind: noop,
        cancel: noop,
        submit: noop,
      }}
      draftNameInputRef={{ current: null }}
    />,
    async (doc) => {
      const buttons = [...doc.querySelectorAll<HTMLButtonElement>(".codex-space-icon")];
      expect(buttons).toHaveLength(spaces.length);
      for (const [index, button] of buttons.entries()) {
        expect(button.getAttribute("aria-label")).toBe(spaces[index].name);
        expect(button.getAttribute("data-tooltip")).toBe(spaces[index].name);
        expect(button.getAttribute("aria-pressed")).toBe(String(index === 1));
        expect(button.querySelector("svg")?.getAttribute("width")).toBe("15");
        expect(button.querySelector("svg")?.classList.contains("text-space-blue")).toBe(true);
        await act(async () => button.click());
      }
      expect(selections).toEqual(spaces.map((space) => space.id));
      expect(buttons[1].classList.contains("bg-accent-soft")).toBe(true);
      // Selection stays visible without impersonating keyboard focus on a
      // pointer press; the focus-visible inset ring is owned by rail CSS.
      expect(buttons[1].classList.contains("ring-1")).toBe(false);
      expect(buttons[1].classList.contains("ring-accent")).toBe(false);
      expect(doc.querySelector('[aria-label="Open Spaces"]')).toBeNull();
      expect(doc.querySelector(".codex-spaces-content")?.hasAttribute("inert")).toBe(true);
      expect(doc.querySelector(".codex-spaces-content")?.getAttribute("aria-hidden")).toBe("true");
    },
  );
});

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
  await mounted(<Probe />, async (doc) => {
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
  await mounted(
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

test("Codex Add keeps its label mounted for expanded view and the shared label fade", async () => {
  await mounted(
    <AddMenu
      collapsible
      open={false}
      mode={null}
      saving={false}
      error={null}
      onOpen={noop}
      onClose={noop}
      onModeChange={noop}
      onSaveNote={async () => true}
      onSaveLink={async () => true}
      onSaveQuote={async () => true}
      onPickFile={noop}
      onScreenshot={noop}
    />,
    (doc) => {
      const trigger = doc.querySelector(".codex-add-button")!;
      expect(trigger.getAttribute("aria-label")).toBe("Add");
      expect(trigger.querySelector(".codex-label")?.textContent).toBe("Add");
      expect(trigger.querySelector(".sr-only")).toBeNull();
      expect(trigger.querySelector("svg")?.getAttribute("width")).toBe("16");
    },
  );
});
