export function createAssetUrlResolver(resolve: (path: string) => Promise<string>) {
  const pending = new Map<string, Promise<string>>();
  return (path: string) => {
    const existing = pending.get(path);
    if (existing) return existing;
    const result = resolve(path).catch((error: unknown) => {
      if (pending.get(path) === result) pending.delete(path);
      throw error;
    });
    const oldest = pending.keys().next();
    if (pending.size >= 4096 && !oldest.done) pending.delete(oldest.value);
    pending.set(path, result);
    return result;
  };
}
