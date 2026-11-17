/**
 * Items per tag, ignoring case, most used first. A tag shows in the spelling most items use,
 * and an item that holds one tag in two spellings counts once.
 */
export function countTags(rows: readonly { id: string; tag: string }[]) {
  const groups = new Map<string, { items: Set<string>; spellings: Map<string, number> }>();
  for (const { id, tag } of rows) {
    const name = tag.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { items: new Set(), spellings: new Map() };
    groups.set(key, group);
    group.items.add(id);
    group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
  }
  return [...groups.values()]
    .map(({ items, spellings }) => ({
      tag: [...spellings].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      count: items.size,
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
