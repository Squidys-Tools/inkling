import { describe, expect, it } from "bun:test";
import type { ContextMenuItem } from "@inkling/contracts/desktop";
import { presentMenu } from "./presentation.ts";

describe("Space context menu presentation", () => {
  it("groups regular and excluded Smart Space actions without changing their IDs or availability", () => {
    const items: ContextMenuItem[] = [
      { type: "item", id: "open", label: "Open" },
      { type: "separator" },
      { type: "item", id: "remove-here", label: "Remove from Current" },
      { type: "item", id: "allow:smart-id", label: "Allow in Research", enabled: false },
      { type: "separator" },
      { type: "item", id: "space:one", label: "Add to Ideas" },
      { type: "item", id: "space:two", label: "Remove from Reading" },
      { type: "separator" },
      { type: "item", id: "archive", label: "Archive", destructive: true },
    ];
    const result = presentMenu(items);
    const group = result.find((entry) => entry.type === "spaces");
    expect(group?.type === "spaces" ? group.items : []).toEqual(
      items
        .filter((item) => item.type === "item")
        .filter((item) => /^(space:|allow:)/.test(item.id)),
    );
    expect(
      result
        .flatMap((entry) => (entry.type === "spaces" ? entry.items : [entry]))
        .filter((entry) => entry.type === "item"),
    ).toEqual(items.filter((entry) => entry.type === "item"));
    expect(result.filter((entry) => entry.type === "spaces")).toHaveLength(1);
    expect(result).toContain(items[2]);
    expect(items).toHaveLength(9);
  });
  it("does not manufacture Space or file actions, and removes orphan separators", () => {
    const restore: ContextMenuItem = { type: "item", id: "restore", label: "Restore to library" };
    const deletion: ContextMenuItem = {
      type: "item",
      id: "delete",
      label: "Delete permanently",
      destructive: true,
    };
    expect(
      presentMenu([
        { type: "separator" },
        restore,
        { type: "separator" },
        { type: "separator" },
        deletion,
        { type: "separator" },
      ]),
    ).toEqual([restore, { type: "separator" }, deletion]);
    expect(presentMenu([])).toEqual([]);
    expect(presentMenu([{ type: "separator" }])).toEqual([]);
  });
});
