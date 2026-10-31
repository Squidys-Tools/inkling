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
import { Effect, Option, Schema } from "effect";
import type { LibraryExportReport } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { withDatabaseFile } from "./database-file.ts";
import { attempt, invalidInput, storageFailure } from "./errors.ts";
import { SCHEMA_VERSION } from "./schema.ts";
import { isInside, isMissing, isSafeItemId, sha256File } from "./shared.ts";

const LastExportJson = Schema.fromJsonString(
  Schema.Struct({ exportedAt: Schema.Finite, items: Schema.Int }),
);
const decodeLastExport = Schema.decodeUnknownOption(LastExportJson);
const encodeLastExport = Schema.encodeSync(LastExportJson);

type AssetFile = { path: string; byteLength: number; sha256: string };
type SkippedAsset = { path: string; error: string };
type Copied = { assetFiles: AssetFile[]; skippedAssets: SkippedAsset[]; assetsBytes: number };

function exportDateStamp(millis: number) {
  const iso = new Date(millis).toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 19).replaceAll(":", "")}`;
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

async function copyItemAssets(
  assetsDirectory: string,
  destination: string,
  itemIds: ReadonlyArray<string>,
) {
  const copied: Copied = { assetFiles: [], skippedAssets: [], assetsBytes: 0 };
  for (const id of itemIds) {
    if (!isSafeItemId(id)) continue;
    const source = join(assetsDirectory, id);
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
    await copyDirectory(source, join(destination, id), `assets/items/${id}`, copied);
  }
  return copied;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

export function makeExport(ctx: StorageContext) {
  const { sql } = ctx;

  const getLastExport = () =>
    sql<{ value: string }>`SELECT value FROM app_settings WHERE key = 'last_export'`.pipe(
      Effect.map(([row]) => Option.getOrNull(decodeLastExport(row?.value))),
    );

  const writeExport = Effect.fnUntraced(function* (directory: string, exportedAt: number) {
    const databasePath = join(directory, "library.sqlite3");
    const createSnapshot = ctx.media.createSnapshot;
    if (createSnapshot) yield* attempt(() => createSnapshot(ctx.databasePath, databasePath));
    else yield* sql`VACUUM INTO ${databasePath}`;
    const { itemIds, archivedItems, spaces } = yield* withDatabaseFile(
      { filename: databasePath, readonly: true },
      (snapshot) => {
        const count = ([row]: ReadonlyArray<{ count: number }>) => Number(row?.count ?? 0);
        return Effect.all({
          itemIds: snapshot<{ id: string }>`SELECT id FROM items`.pipe(
            Effect.map((rows) => rows.map((row) => row.id)),
          ),
          archivedItems: snapshot<{ count: number }>`SELECT COUNT(*) AS count FROM items
            WHERE archived = 1`.pipe(Effect.map(count)),
          spaces: snapshot<{ count: number }>`SELECT COUNT(*) AS count FROM spaces`.pipe(
            Effect.map(count),
          ),
        });
      },
    );
    const databaseBytes = (yield* attempt(() => stat(databasePath))).size;
    const copied = yield* attempt(() =>
      copyItemAssets(ctx.assetsDirectory, join(directory, "assets", "items"), itemIds),
    );
    const manifest = {
      format: "inkling-export",
      formatVersion: 1,
      appVersion: ctx.appVersion,
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
    const lastExport = encodeLastExport({ exportedAt, items: report.items });
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
