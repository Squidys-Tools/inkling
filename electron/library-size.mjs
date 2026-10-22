import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

async function directoryBytes(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
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

export function createLibrarySizeCache(databasePath, assetsDirectory) {
  let cached;
  let refreshing;
  return {
    get({ refresh = false } = {}) {
      if (cached && !refresh) return Promise.resolve(cached);
      refreshing ??= (async () => {
        const [database, assets] = await Promise.all([
          stat(databasePath).then(
            (info) => info.size,
            (error) => {
              if (error.code === "ENOENT") return 0;
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
