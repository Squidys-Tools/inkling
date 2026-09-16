type RediscoveryItem = {
  id: string | number;
  createdAt?: number;
  archived?: boolean;
};

export function serendipityItems<T extends RediscoveryItem>(items: readonly T[]) {
  return items
    .filter((item) => !item.archived)
    .sort((a, b) => {
      const age = (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity);
      return (Number.isNaN(age) ? 0 : age) || String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 12);
}
