type WithId = { id: string | number };

/**
 * Untouched and unchanged items keep their object identity so memoized cards skip
 * re-rendering. An item missing from `patched` was archived or deleted and is dropped.
 */
export function patchItems<T extends WithId>(
  current: T[],
  changedIds: ReadonlySet<string>,
  patched: ReadonlyMap<string, T>,
): T[] {
  let changed = false;
  const next: T[] = [];
  for (const item of current) {
    const id = String(item.id);
    if (!changedIds.has(id)) {
      next.push(item);
      continue;
    }
    const replacement = patched.get(id);
    if (!replacement) {
      changed = true;
    } else if (JSON.stringify(replacement) === JSON.stringify(item)) {
      next.push(item);
    } else {
      changed = true;
      next.push(replacement);
    }
  }
  return changed ? next : current;
}
