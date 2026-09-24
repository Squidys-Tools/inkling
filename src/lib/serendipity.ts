type RediscoveryItem = {
  id: string | number;
  createdAt?: number;
  archived?: boolean;
};

type SerendipityOptions = {
  excludedIds?: ReadonlySet<string | number>;
  limit?: number;
};

export function serendipityItems<T extends RediscoveryItem>(
  items: readonly T[],
  options: SerendipityOptions = {},
) {
  const excludedIds = options.excludedIds;
  const requestedLimit = options.limit ?? 12;
  const limit = Number.isFinite(requestedLimit) ? Math.max(0, requestedLimit) : items.length;

  return items
    .filter((item) => {
      if (item.archived) return false;
      if (!excludedIds) return true;
      return !excludedIds.has(item.id) && !excludedIds.has(String(item.id));
    })
    .sort((a, b) => {
      const age = (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity);
      return (Number.isNaN(age) ? 0 : age) || String(a.id).localeCompare(String(b.id));
    })
    .slice(0, limit);
}
