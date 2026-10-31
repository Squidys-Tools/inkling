import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { isMissing } from "./storage/shared.ts";

async function directoryBytes(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  let bytes = 0;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) bytes += await directoryBytes(path);
    else if (entry.isFile()) bytes += (await stat(path)).size;
  }
  return bytes;
}

export function createLibrarySizeCache(databasePath: string, assetsDirectory: string) {
  let cached: { bytes: number } | undefined;
  let refreshing: Promise<{ bytes: number }> | undefined;
  return {
    get({ refresh = false } = {}) {
      if (cached && !refresh) return Promise.resolve(cached);
      refreshing ??= (async () => {
        const [database, assets] = await Promise.all([
          stat(databasePath).then(
            (info) => info.size,
            (error: unknown) => {
              if (isMissing(error)) return 0;
              throw error;
            },
          ),
          directoryBytes(assetsDirectory),
        ]);
        cached = { bytes: database + assets };
        return cached;
      })().finally(() => {
        refreshing = undefined;
      });
      return refreshing;
    },
  };
}
