type WithId = { id: string | number };

/**
 * Applies a few changed items to a loaded list without disturbing the rest.
 * Untouched items keep their identity so memoized cards skip re-rendering, and
 * a patched item that came back identical keeps its old object too. An item
 * missing from `patched` is gone (archived or deleted) and is dropped. Returns
 * the same array when nothing changed.
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
