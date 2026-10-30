import { expect, test } from "bun:test";
import { act } from "react";
import { Sidebar } from "./Sidebar";
import { SpacesSection } from "./SpacesSection";
import { APPEARANCE_OPTIONS } from "../settings/appearance";
import { mountInTestDom } from "../testDom";

const noop = () => {};
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
  await mountInTestDom(sidebar(true, false), (doc) => {
    const aside = doc.querySelector("aside")!;
    expect(aside.hasAttribute("inert")).toBe(false);
    expect(aside.getAttribute("data-collapsed")).toBe("true");
    expect(doc.querySelector('[aria-label="Open sidebar"]')?.tagName).toBe("BUTTON");
    expect(doc.querySelector('[aria-label="Open sidebar"] svg')).not.toBeNull();
    expect(doc.querySelector('[aria-label="Everything"]')).not.toBeNull();
    expect(doc.querySelector('[aria-label="Close sidebar"]')?.hasAttribute("hidden")).toBe(true);
    expect(doc.querySelector('[role="separator"]')).toBeNull();
  });
  await mountInTestDom(sidebar(true, true), (doc) =>
    expect(doc.querySelector('[aria-label="Open sidebar"]')).toBeNull(),
  );
});

test("Classic retains hidden collapse and stays the default appearance choice", async () => {
  await mountInTestDom(sidebar(false, false), (doc) => {
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
  await mountInTestDom(
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
