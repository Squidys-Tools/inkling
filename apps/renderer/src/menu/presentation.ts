import type { ContextMenuItem } from "@inkling/contracts/desktop";

export type MenuAction = Extract<ContextMenuItem, { type: "item" }>;
export type MenuEntry = ContextMenuItem | { type: "spaces"; items: MenuAction[] };

/** Space grouping is presentation only: action IDs still belong to their callers. */
export function presentMenu(items: ContextMenuItem[]): MenuEntry[] {
  const spaces = items.filter(
    (item): item is MenuAction => item.type === "item" && /^(space:|allow:)/.test(item.id),
  );
  const entries: MenuEntry[] = [];
  let grouped = false;
  for (const item of items) {
    if (item.type === "item" && /^(space:|allow:)/.test(item.id)) {
      if (!grouped) entries.push({ type: "spaces", items: spaces });
      grouped = true;
    } else if (
      item.type !== "separator" ||
      (entries.length && entries.at(-1)?.type !== "separator")
    ) {
      entries.push(item);
    }
  }
  if (entries.at(-1)?.type === "separator") entries.pop();
  return entries;
}
