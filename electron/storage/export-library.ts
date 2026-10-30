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
import { Effect } from "effect";
import type { LastExport, LibraryExportReport } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { attempt, invalidInput, storageFailure } from "./errors.ts";
import { SCHEMA_VERSION } from "./schema.ts";
import { isInside, isMissing, isSafeItemId, parseJson, sha256File } from "./shared.ts";

type AssetFile = { path: string; byteLength: number; sha256: string };
type SkippedAsset = { path: string; error: string };
type Copied = { assetFiles: AssetFile[]; skippedAssets: SkippedAsset[]; assetsBytes: number };

function exportDateStamp(millis: number) {
  const date = new Date(millis);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function copyFileAtomically(source: string, destination: string) {
  const partial = `${destination}.inkling-export-part`;
  try {
    await copyFile(source, partial);
    const bytes = (await stat(partial)).size;
    await rename(partial, destination);
    return bytes;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function copyDirectory(
  source: string,
  destination: string,
  relativePath: string,
  copied: Copied,
) {
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
    throw new Error("invalid storage input: an item asset directory is unsafe");
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
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

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

function readSnapshotCounts(databasePath: string) {
  const snapshot = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const count = (query: string) => Number(snapshot.prepare(query).get()?.count ?? 0);
    return {
      itemIds: snapshot
        .prepare("SELECT id FROM items")
        .all()
        .map((row) => String(row.id)),
      archivedItems: count("SELECT COUNT(*) AS count FROM items WHERE archived = 1"),
      spaces: count("SELECT COUNT(*) AS count FROM spaces"),
    };
  } finally {
    snapshot.close();
  }
}

export function makeExport(ctx: StorageContext) {
  const { sql } = ctx;

  const getLastExport = () =>
    sql<{ value: string }>`SELECT value FROM app_settings WHERE key = 'last_export'`.pipe(
      Effect.map(([row]): LastExport | null => {
        const value = parseJson<{ exportedAt?: unknown; items?: unknown } | null>(row?.value, null);
        if (!value || !Number.isFinite(value.exportedAt) || !Number.isInteger(value.items))
          return null;
        return { exportedAt: Number(value.exportedAt), items: Number(value.items) };
      }),
    );

  const writeExport = Effect.fnUntraced(function* (directory: string, exportedAt: number) {
    const databasePath = join(directory, "library.sqlite3");
    const createSnapshot = ctx.media.createSnapshot;
    if (createSnapshot) yield* attempt(() => createSnapshot(ctx.databasePath, databasePath));
    else yield* sql`VACUUM INTO ${databasePath}`;
    const { itemIds, archivedItems, spaces } = yield* Effect.try({
      try: () => readSnapshotCounts(databasePath),
      catch: (cause) => cause,
    });
    const databaseBytes = (yield* attempt(() => stat(databasePath))).size;
    const copied: Copied = { assetFiles: [], skippedAssets: [], assetsBytes: 0 };
    yield* attempt(async () => {
      for (const id of itemIds) {
        if (!isSafeItemId(id)) continue;
        const source = join(ctx.assetsDirectory, id);
        const info = await stat(source).catch((error) =>
          isMissing(error) ? null : Promise.reject(error),
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
    });
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
    yield* attempt(() =>
      writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    );
    const report: LibraryExportReport = {
      directory,
      items: itemIds.length,
      archivedItems,
      spaces,
      assetFiles: copied.assetFiles.length,
      skippedAssets: copied.skippedAssets.length,
      databaseBytes,
      assetsBytes: copied.assetsBytes,
    };
    const lastExport = JSON.stringify({ exportedAt, items: report.items });
    yield* sql`INSERT INTO app_settings (key, value) VALUES ('last_export', ${lastExport})
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
    return report;
  });

  const exportLibrary = Effect.fnUntraced(function* (
    destination: string,
    timezoneOffsetMinutes = new Date().getTimezoneOffset(),
  ) {
    const target = resolve(destination);
    const targetInfo = yield* attempt(() => stat(target)).pipe(
      Effect.catch(() => invalidInput("choose an existing folder to export into")),
    );
    if (!targetInfo.isDirectory())
      return yield* invalidInput("choose an existing folder to export into");
    const assetsRoot = yield* attempt(() => realpath(ctx.assetsRoot).catch(() => ctx.assetsRoot));
    const realTarget = yield* attempt(() => realpath(target));
    if (isInside(realTarget, assetsRoot))
      return yield* invalidInput("choose a folder outside inkling's own asset store");
    const exportedAt = Date.now();
    const stamp = exportDateStamp(exportedAt - (timezoneOffsetMinutes || 0) * 60_000);
    let directory = join(target, `inkling-export-${stamp}`);
    for (let index = 2; yield* attempt(() => exists(directory)); index += 1) {
      if (index >= 1000)
        return yield* storageFailure(
          "all export directory names for this timestamp are already in use",
        );
      directory = join(target, `inkling-export-${stamp}-${index}`);
    }
    yield* attempt(() => mkdir(directory));
    return yield* writeExport(directory, exportedAt).pipe(
      Effect.tapError(() =>
        attempt(() => rm(directory, { recursive: true, force: true })).pipe(Effect.ignore),
      ),
    );
  });

  return { getLastExport, exportLibrary };
}
