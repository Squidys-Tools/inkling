export function createAssetUrlResolver(
  resolve: (path: string) => Promise<string>,
  limit = 4096,
) {
  const pending = new Map<string, Promise<string>>();
  const touch = (path: string, value: Promise<string>) => {
    // Re-insert so the touched path counts as most recently used; the
    // oldest entry in iteration order is always the eviction candidate.
    pending.delete(path);
    pending.set(path, value);
  };
  return (path: string) => {
    const existing = pending.get(path);
    if (existing) {
      touch(path, existing);
      return existing;
    }
    const result = resolve(path).catch((error: unknown) => {
      if (pending.get(path) === result) pending.delete(path);
      throw error;
    });
    if (pending.size >= limit) {
      const oldest = pending.keys().next();
      if (oldest.value !== undefined) pending.delete(oldest.value);
    }
    pending.set(path, result);
    return result;
  };
}
