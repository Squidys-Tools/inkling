import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Effect } from "effect";
import type { LibraryImportReport } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { attempt, invalidInput, storageFailure } from "./errors.ts";
import { IMAGE_THUMBNAIL_JOB, VIDEO_POSTER_JOB } from "./jobs.ts";
import { openDatabase, SCHEMA_VERSION } from "./schema.ts";
import {
  isInside,
  isMissing,
  isSafeItemId,
  isMetadata,
  isWebUrl,
  parseJson,
  sha256File,
} from "./shared.ts";
import { normalizeSpaceColor, validateSmartQuery } from "./spaces.ts";

type ImportedItem = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  body: string | null;
  body_format: string | null;
  source_url: string | null;
  source_label: string | null;
  local_asset_path: string | null;
  thumbnail_path: string | null;
  ocr_text: string;
  metadata: string;
  created_at: number;
  updated_at: number;
  archived: number;
  favorite: number;
};

type ImportedSpace = {
  id: string;
  name: string;
  color: string;
  query: string;
  kind: string;
  created_at: number;
  updated_at: number;
};

type Membership = { space_id: string; item_id: string; added_at: number };
type Exclusion = { space_id: string; item_id: string; excluded_at: number };

type Manifest = {
  format?: unknown;
  formatVersion?: unknown;
  schemaVersion?: unknown;
  counts?: { items?: unknown; spaces?: unknown; assetFiles?: unknown; skippedAssets?: unknown };
  skippedAssets?: unknown[];
  assetFiles?: { path?: unknown; byteLength?: unknown; sha256?: unknown }[];
};

const reject = (detail: string): never => {
  throw new Error(`invalid storage input: ${detail}`);
};

const validateImportedSpace = Effect.fnUntraced(function* (space: ImportedSpace) {
  if (!isSafeItemId(space.id))
    return yield* invalidInput("the export contains an invalid Space id");
  if (typeof space.name !== "string" || !space.name.trim() || Buffer.byteLength(space.name) > 80)
    return yield* invalidInput("the export contains an invalid Space name");
  if (space.kind !== "smart" && space.kind !== "regular")
    return yield* invalidInput("the export contains an unsupported Space kind");
  const query = parseJson<unknown>(space.query, null);
  if (!isMetadata(query)) return yield* invalidInput("the export contains an invalid Space query");
  // Older exports can carry a pin filter; it is accepted and dropped with pins.
  if (Object.keys(query).some((field) => !["text", "kind", "tag", "favorite"].includes(field)))
    return yield* invalidInput("the export contains an unsupported Space query field");
  return { ...space, query: JSON.stringify(yield* validateSmartQuery(query)) };
});

function readImportStage(databasePath: string) {
  // Opening migrates the staged copy to the current schema before it is read.
  const stage = openDatabase(databasePath);
  try {
    return {
      items: stage.db
        .prepare(`SELECT id, kind, title, description, body, body_format, source_url,
        source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
        archived, favorite FROM items ORDER BY created_at, id`)
        .all() as ImportedItem[],
      spaces: stage.db
        .prepare("SELECT * FROM spaces ORDER BY position, created_at, id")
        .all() as ImportedSpace[],
      memberships: stage.db
        .prepare(
          "SELECT space_id, item_id, added_at FROM space_items ORDER BY added_at, space_id, item_id",
        )
        .all() as Membership[],
      exclusions: stage.db
        .prepare("SELECT space_id, item_id, excluded_at FROM space_exclusions")
        .all() as Exclusion[],
    };
  } finally {
    stage.db.close();
  }
}

function readExportDatabaseHeader(path: string) {
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      schemaVersion: source.prepare("PRAGMA user_version").get()?.user_version,
      integrity: source.prepare("PRAGMA integrity_check").get()?.integrity_check,
    };
  } finally {
    source.close();
  }
}

async function collectAssetFiles(
  root: string,
  relativeDirectory = "assets/items",
  results: string[] = [],
) {
  const rootInfo = await lstat(root).catch((error) =>
    isMissing(error) ? null : Promise.reject(error),
  );
  if (!rootInfo) return results;
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    reject("the export contains an unsafe asset directory");
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) reject("the export contains a symbolic link in its asset files");
    if (entry.isDirectory()) await collectAssetFiles(path, relativePath, results);
    else if (entry.isFile()) results.push(relativePath);
    else reject("the export contains an unsupported asset file");
  }
  return results;
}

async function verifyExportAsset(exportDirectory: string, itemId: string, relativePath: unknown) {
  const components = String(relativePath).split("/");
  if (
    components.length < 4 ||
    components[0] !== "assets" ||
    components[1] !== "items" ||
    components[2] !== itemId ||
    components.some(
      (part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes(":"),
    )
  ) {
    reject(`the export contains an unsafe asset path for item ${itemId}`);
  }
  let path = join(exportDirectory, "assets", "items", itemId);
  for (const [index, component] of components.slice(3).entries()) {
    path = join(path, component);
    const info = await lstat(path).catch(() =>
      reject(`the export is missing a referenced asset: ${relativePath}`),
    );
    if (
      info.isSymbolicLink() ||
      (index === components.length - 4 ? !info.isFile() : !info.isDirectory())
    ) {
      reject(`the export contains an unsafe or invalid asset: ${relativePath}`);
    }
  }
  return path;
}

async function copyAssetDirectory(source: string, destination: string): Promise<number> {
  const info = await lstat(source).catch((error) =>
    isMissing(error) ? null : Promise.reject(error),
  );
  if (!info) return 0;
  if (!info.isDirectory() || info.isSymbolicLink())
    reject("the export contains an unsafe item asset folder");
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) reject("the export contains a symbolic link in its asset files");
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) count += await copyAssetDirectory(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      count += 1;
    } else reject("the export contains an unsupported asset file");
  }
  return count;
}

async function readManifest(exportRoot: string): Promise<Manifest> {
  const manifestPath = join(exportRoot, "manifest.json");
  const manifestInfo = await lstat(manifestPath).catch(() => null);
  if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink())
    reject("the selected folder is missing manifest.json");
  const manifest: Manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== "inkling-export" || manifest.formatVersion !== 1)
    reject("the selected folder is not a supported Inkling export");
  const schemaVersion = Number(manifest.schemaVersion);
  if (!(schemaVersion >= 1 && schemaVersion <= SCHEMA_VERSION))
    reject("the export was created by an unsupported library version");
  const skipped = Math.max(
    Number(manifest.counts?.skippedAssets ?? 0),
    (manifest.skippedAssets ?? []).length,
  );
  if (skipped !== 0) {
    reject(
      `this export is incomplete: ${skipped} asset files were skipped during export; create a complete export before restoring it`,
    );
  }
  return manifest;
}

// Checks every asset the export references against the files on disk and the
// manifest's hashes. Returns how many files had no integrity record to check.
async function verifyExportAssets(
  exportRoot: string,
  manifest: Manifest,
  items: ImportedItem[],
  actualPaths: string[],
) {
  const itemIds = new Set(items.map((item) => item.id));
  for (const item of items) {
    for (const assetPath of [item.local_asset_path, item.thumbnail_path].filter(Boolean)) {
      const path = await verifyExportAsset(exportRoot, item.id, assetPath);
      if (item.local_asset_path !== assetPath) continue;
      const expected = parseJson<{ byteLength?: unknown }>(item.metadata, {}).byteLength;
      if (expected != null && (await stat(path)).size !== Number(expected))
        reject(`the export contains a damaged asset with an unexpected size: ${assetPath}`);
    }
  }
  if (Number(manifest.counts?.assetFiles) !== actualPaths.length)
    reject("the export manifest asset count does not match its files");
  if (!Array.isArray(manifest.assetFiles)) return actualPaths.length;
  if (manifest.assetFiles.length !== actualPaths.length)
    reject("the export manifest asset list does not match its files");
  const listedPaths = new Set<string>();
  for (const asset of manifest.assetFiles) {
    const assetPath = String(asset.path);
    const assetItemId = assetPath.split("/")[2];
    const sha256 = typeof asset.sha256 === "string" ? asset.sha256 : "";
    if (!itemIds.has(assetItemId) || !/^[0-9a-f]{64}$/i.test(sha256))
      reject("the export manifest contains an invalid asset entry");
    const path = await verifyExportAsset(exportRoot, assetItemId, assetPath);
    if (
      (await stat(path)).size !== Number(asset.byteLength) ||
      (await sha256File(path)).toLowerCase() !== sha256.toLowerCase()
    ) {
      reject(`the export contains a damaged asset: ${assetPath}`);
    }
    if (listedPaths.has(assetPath)) reject("the export manifest contains a duplicate asset path");
    listedPaths.add(assetPath);
  }
  if (actualPaths.some((path) => !listedPaths.has(path)))
    reject("the export manifest asset list does not match its files");
  for (const item of items) {
    for (const path of [item.local_asset_path, item.thumbnail_path]) {
      if (path && !listedPaths.has(path))
        reject(`the export manifest is missing an integrity record for asset: ${path}`);
    }
  }
  return 0;
}

const removeDirectories = (directories: string[]) =>
  attempt(async () => {
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
  }).pipe(Effect.ignore);

export function makeImport(ctx: StorageContext) {
  const { sql, jobs } = ctx;
  const ids = (table: "items" | "spaces") =>
    sql<{ id: string }>`SELECT id FROM ${sql.literal(table)}`.pipe(
      Effect.map((rows) => new Set(rows.map((row) => row.id))),
    );

  const insertStaged = Effect.fnUntraced(function* (
    items: ImportedItem[],
    spaces: ImportedSpace[],
    memberships: Membership[],
    exclusions: Exclusion[],
    assetFilesByItem: Map<string, number>,
  ) {
    const currentItemIds = yield* ids("items");
    const currentSpaceIds = yield* ids("spaces");
    const importedItemIds = new Set<string>();
    const importedSpaceIds = new Set<string>();
    let assetFiles = 0;
    let skippedDuplicateItems = 0;
    let skippedDuplicateSpaces = 0;
    for (const item of items) {
      if (currentItemIds.has(item.id)) {
        if (assetFilesByItem.has(item.id))
          return yield* storageFailure(
            "the active library changed while the export was being checked",
          );
        skippedDuplicateItems += 1;
        continue;
      }
      yield* sql`INSERT INTO items (id, kind, title, description, body, body_format, source_url,
        source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
        archived, favorite) VALUES (${item.id}, ${item.kind}, ${item.title}, ${item.description},
        ${item.body ?? ""}, ${item.body_format ?? "md"}, ${item.source_url}, ${item.source_label},
        ${item.local_asset_path}, ${item.thumbnail_path}, ${item.ocr_text}, ${item.metadata},
        ${item.created_at}, ${item.updated_at}, ${item.archived}, ${item.favorite})`;
      if (item.kind === "image") yield* jobs.enqueue(item.id, "ocr_image");
      if (item.kind === "image" && !item.thumbnail_path)
        yield* jobs.enqueue(item.id, IMAGE_THUMBNAIL_JOB);
      if (item.kind === "pdf") yield* jobs.enqueue(item.id, "ocr_pdf_page");
      if (item.kind === "video" && !item.thumbnail_path)
        yield* jobs.enqueue(item.id, VIDEO_POSTER_JOB);
      yield* jobs.enqueue(item.id, "generate_embedding");
      importedItemIds.add(item.id);
      assetFiles += assetFilesByItem.get(item.id) ?? 0;
    }
    let [{ value: nextPosition }] = yield* sql<{
      value: number;
    }>`SELECT COALESCE(MAX(position), -1) AS value
      FROM spaces`;
    for (const space of spaces) {
      if (currentSpaceIds.has(space.id)) {
        skippedDuplicateSpaces += 1;
        continue;
      }
      nextPosition += 1;
      yield* sql`INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at)
        VALUES (${space.id}, ${space.name}, ${normalizeSpaceColor(space.color)}, ${space.query},
        ${space.kind}, ${nextPosition}, ${space.created_at}, ${space.updated_at})`;
      importedSpaceIds.add(space.id);
    }
    for (const membership of memberships) {
      if (
        importedSpaceIds.has(membership.space_id) &&
        (importedItemIds.has(membership.item_id) || currentItemIds.has(membership.item_id))
      ) {
        yield* sql`INSERT OR IGNORE INTO space_items (space_id, item_id, added_at)
          VALUES (${membership.space_id}, ${membership.item_id}, ${membership.added_at})`;
      }
    }
    for (const exclusion of exclusions) {
      if (
        importedSpaceIds.has(exclusion.space_id) &&
        (importedItemIds.has(exclusion.item_id) || currentItemIds.has(exclusion.item_id))
      ) {
        yield* sql`INSERT OR IGNORE INTO space_exclusions (space_id, item_id, excluded_at)
          VALUES (${exclusion.space_id}, ${exclusion.item_id}, ${exclusion.excluded_at})`;
      }
    }
    return {
      importedItems: importedItemIds.size,
      skippedDuplicateItems,
      importedSpaces: importedSpaceIds.size,
      skippedDuplicateSpaces,
      assetFiles,
    };
  });

  const importStaged = Effect.fnUntraced(function* (
    exportRoot: string,
    manifest: Manifest,
    stageRoot: string,
  ) {
    const stageDatabase = join(stageRoot, "library.sqlite3");
    yield* attempt(() => copyFile(join(exportRoot, "library.sqlite3"), stageDatabase));
    const stage = yield* Effect.try({
      try: () => readImportStage(stageDatabase),
      catch: (cause) => cause,
    });
    const { items, memberships, exclusions } = stage;
    const spaces: ImportedSpace[] = [];
    for (const space of stage.spaces) spaces.push(yield* validateImportedSpace(space));
    if (
      items.length !== Number(manifest.counts?.items) ||
      spaces.length !== Number(manifest.counts?.spaces)
    )
      return yield* invalidInput("the export manifest counts do not match its database");
    for (const item of items) {
      if (!isSafeItemId(item.id))
        return yield* invalidInput("the export contains an unsafe item id");
      const metadata = parseJson<unknown>(item.metadata, undefined);
      if (metadata === undefined)
        return yield* invalidInput("the export contains invalid item metadata");
      item.metadata = JSON.stringify(metadata);
      item.source_url = isWebUrl(item.source_url ?? "") ? item.source_url : null;
    }
    const itemIds = new Set(items.map((item) => item.id));
    const spaceIds = new Set(spaces.map((space) => space.id));
    if (memberships.some((m) => !spaceIds.has(m.space_id) || !itemIds.has(m.item_id)))
      return yield* invalidInput("the export contains incomplete Space memberships");
    if (
      exclusions.some(
        (e) =>
          !spaceIds.has(e.space_id) ||
          !itemIds.has(e.item_id) ||
          spaces.find((s) => s.id === e.space_id)?.kind !== "smart" ||
          !Number.isFinite(e.excluded_at),
      )
    )
      return yield* invalidInput("the export contains invalid Space exclusions");
    const existingItemIds = yield* ids("items");

    const actualPaths = yield* attempt(() =>
      collectAssetFiles(join(exportRoot, "assets", "items")),
    );
    const assetFileCounts = new Map<string, number>();
    for (const path of actualPaths) {
      const itemId = path.split("/")[2];
      assetFileCounts.set(itemId, (assetFileCounts.get(itemId) ?? 0) + 1);
    }
    yield* attempt(async () => {
      for (const itemId of itemIds) {
        if (existingItemIds.has(itemId)) continue;
        const source = join(exportRoot, "assets", "items", itemId);
        const isDirectory = await lstat(source).then(
          (info) => info.isDirectory(),
          () => false,
        );
        if (isDirectory)
          await copyAssetDirectory(source, join(stageRoot, "assets", "items", itemId));
      }
    });
    const unverifiedAssetFiles = yield* attempt(() =>
      verifyExportAssets(exportRoot, manifest, items, actualPaths),
    );

    const movedAssetDirectories: string[] = [];
    const assetFilesByItem = new Map<string, number>();
    yield* attempt(async () => {
      for (const item of items) {
        if (existingItemIds.has(item.id)) continue;
        const stagedAssets = join(stageRoot, "assets", "items", item.id);
        const targetAssets = join(ctx.assetsDirectory, item.id);
        const stagedInfo = await lstat(stagedAssets).catch((error) =>
          isMissing(error) ? null : Promise.reject(error),
        );
        if (stagedInfo?.isDirectory()) {
          const targetExists = await lstat(targetAssets).then(
            () => true,
            () => false,
          );
          if (targetExists)
            reject(`asset files already exist for item ${item.id}; refusing to overwrite them`);
          await mkdir(dirname(targetAssets), { recursive: true });
          await rename(stagedAssets, targetAssets);
          movedAssetDirectories.push(targetAssets);
          assetFilesByItem.set(item.id, assetFileCounts.get(item.id) ?? 0);
        } else if (item.local_asset_path || item.thumbnail_path) {
          reject(`asset files for item ${item.id} could not be staged`);
        }
      }
    }).pipe(Effect.tapError(() => removeDirectories(movedAssetDirectories)));

    const report = yield* sql
      .withTransaction(insertStaged(items, spaces, memberships, exclusions, assetFilesByItem))
      .pipe(Effect.tapError(() => removeDirectories(movedAssetDirectories)));
    return { ...report, unverifiedAssetFiles } satisfies LibraryImportReport;
  });

  const importLibrary = Effect.fnUntraced(function* (exportDirectory: unknown) {
    const exportRoot = yield* attempt(() =>
      realpath(String(exportDirectory ?? "")).catch(() => null),
    );
    if (!exportRoot) return yield* invalidInput("choose an existing Inkling export folder");
    const exportInfo = yield* attempt(() => stat(exportRoot));
    if (!exportInfo.isDirectory())
      return yield* invalidInput("choose an existing Inkling export folder");
    const assetsRoot = yield* attempt(() => realpath(ctx.assetsRoot).catch(() => ctx.assetsRoot));
    if (isInside(exportRoot, assetsRoot))
      return yield* storageFailure("choose an export folder outside inkling's asset store");
    const manifest = yield* attempt(() => readManifest(exportRoot));
    const sourceDatabasePath = join(exportRoot, "library.sqlite3");
    const databaseInfo = yield* attempt(() => lstat(sourceDatabasePath).catch(() => null));
    if (!databaseInfo?.isFile() || databaseInfo.isSymbolicLink())
      return yield* invalidInput("library.sqlite3 must be a regular file");
    const header = yield* Effect.try({
      try: () => readExportDatabaseHeader(sourceDatabasePath),
      catch: (cause) => cause,
    });
    if (header.schemaVersion !== manifest.schemaVersion)
      return yield* invalidInput("the export manifest does not match its database");
    if (header.integrity !== "ok")
      return yield* invalidInput("the export database failed its integrity check");

    return yield* Effect.acquireUseRelease(
      attempt(() => mkdtemp(join(dirname(ctx.databasePath), ".inkling-import-"))),
      (stageRoot) => importStaged(exportRoot, manifest, stageRoot),
      (stageRoot) =>
        attempt(() => {
          // Bun keeps closed SQLite files locked until temporary statement wrappers finalize.
          (globalThis as { Bun?: { gc(force: boolean): void } }).Bun?.gc(true);
          return rm(stageRoot, { recursive: true, force: true });
        }).pipe(Effect.ignore),
    );
  });

  return { importLibrary };
}
