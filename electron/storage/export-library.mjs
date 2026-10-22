import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_VERSION } from "./schema.mjs";
import { isInside, nowMillis, parseJson, sha256File } from "./shared.mjs";

function exportDateStamp(millis) {
  const date = new Date(millis);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function copyFileAtomically(source, destination) {
  const partial = `${destination}.inkling-export-part`;
  try {
    const bytes = await copyFile(source, partial).then(async () => (await stat(partial)).size);
    await rename(partial, destination);
    return bytes;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function copyDirectory(source, destination, relativePath, copied) {
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
    throw new Error("invalid storage input: an item asset directory is unsafe");
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(destination, entry.name);
    const path = `${relativePath}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      copied.skippedAssets.push({ path, error: "symbolic links are not supported" });
    } else if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, path, copied);
    } else if (entry.isFile()) {
      try {
        const byteLength = await copyFileAtomically(sourcePath, targetPath);
        copied.assetFiles.push({ path, byteLength, sha256: await sha256File(targetPath) });
        copied.assetsBytes += byteLength;
      } catch (error) {
        copied.skippedAssets.push({ path, error: String(error) });
      }
    }
  }
}

export const exportMethods = {
  getLastExport() {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key = 'last_export'").get();
    const value = parseJson(row?.value, null);
    if (!value || !Number.isFinite(value.exportedAt) || !Number.isInteger(value.items)) return null;
    return { exportedAt: value.exportedAt, items: value.items };
  },

  async exportLibrary(destination, timezoneOffsetMinutes = new Date().getTimezoneOffset()) {
    const target = resolve(String(destination ?? ""));
    let targetInfo;
    try {
      targetInfo = await stat(target);
    } catch {
      throw new Error("invalid storage input: choose an existing folder to export into");
    }
    if (!targetInfo.isDirectory())
      throw new Error("invalid storage input: choose an existing folder to export into");
    const assetsRoot = await realpath(this.assetsRoot).catch(() => this.assetsRoot);
    const realTarget = await realpath(target);
    if (isInside(realTarget, assetsRoot))
      throw new Error("invalid storage input: choose a folder outside inkling's own asset store");
    const exportedAt = nowMillis();
    const wallClock = exportedAt - Number(timezoneOffsetMinutes || 0) * 60_000;
    const stamp = exportDateStamp(wallClock);
    let directory = join(target, `inkling-export-${stamp}`);
    for (
      let index = 2;
      await stat(directory).then(
        () => true,
        () => false,
      );
      index += 1
    ) {
      if (index >= 1000)
        throw new Error("all export directory names for this timestamp are already in use");
      directory = join(target, `inkling-export-${stamp}-${index}`);
    }
    await mkdir(directory);
    try {
      const databasePath = join(directory, "library.sqlite3");
      if (this.createSnapshot) await this.createSnapshot(this.databasePath, databasePath);
      else this.db.prepare("VACUUM INTO ?").run(databasePath);
      const snapshotDb = new DatabaseSync(databasePath, { readOnly: true });
      let itemIds;
      let archivedItems;
      let spaces;
      try {
        itemIds = snapshotDb
          .prepare("SELECT id FROM items")
          .all()
          .map((row) => row.id);
        archivedItems = snapshotDb
          .prepare("SELECT COUNT(*) AS count FROM items WHERE archived = 1")
          .get().count;
        spaces = snapshotDb.prepare("SELECT COUNT(*) AS count FROM spaces").get().count;
      } finally {
        snapshotDb.close();
      }
      const databaseBytes = (await stat(databasePath)).size;
      const copied = { assetFiles: [], skippedAssets: [], assetsBytes: 0 };
      for (const id of itemIds) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) continue;
        const source = join(this.assetsDirectory, id);
        const info = await stat(source).catch((error) =>
          error.code === "ENOENT" ? null : Promise.reject(error),
        );
        if (!info) continue;
        if (!info.isDirectory()) {
          copied.skippedAssets.push({
            path: `assets/items/${id}`,
            error: "asset path is not a directory",
          });
          continue;
        }
        await copyDirectory(
          source,
          join(directory, "assets", "items", id),
          `assets/items/${id}`,
          copied,
        );
      }
      const manifest = {
        format: "inkling-export",
        formatVersion: 1,
        appVersion: "0.1.0",
        schemaVersion: SCHEMA_VERSION,
        exportedAt,
        counts: {
          items: itemIds.length,
          archivedItems,
          spaces,
          assetFiles: copied.assetFiles.length,
          skippedAssets: copied.skippedAssets.length,
        },
        bytes: { database: databaseBytes, assets: copied.assetsBytes },
        assetFiles: copied.assetFiles,
        skippedAssets: copied.skippedAssets,
        regenerable: { tables: ["item_embeddings", "items_fts"], columns: ["items.ocr_text"] },
      };
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      const report = {
        directory,
        items: itemIds.length,
        archivedItems,
        spaces,
        assetFiles: copied.assetFiles.length,
        skippedAssets: copied.skippedAssets.length,
        databaseBytes,
        assetsBytes: copied.assetsBytes,
      };
      this.db
        .prepare(`INSERT INTO app_settings (key, value) VALUES ('last_export', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(JSON.stringify({ exportedAt, items: report.items }));
      return report;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  },
};
