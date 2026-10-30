import { copyFile, lstat, mkdir, mkdtemp, realpath, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect, Predicate } from "effect";
import type { LibraryImportReport } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { withDatabaseFile } from "./database-file.ts";
import { attempt, invalidInput, storageFailure } from "./errors.ts";
import {
  collectAssetFiles,
  type Manifest,
  readManifest,
  reject,
  stageExportAssets,
  verifyExportAssets,
} from "./export-folder.ts";
import { IMAGE_THUMBNAIL_JOB, VIDEO_POSTER_JOB } from "./jobs.ts";
import { openDatabase } from "./schema.ts";
import { isInside, isMissing, isSafeItemId, isWebUrl, parseJson } from "./shared.ts";
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

const validateImportedSpace = Effect.fnUntraced(function* (space: ImportedSpace) {
  if (!isSafeItemId(space.id))
    return yield* invalidInput("the export contains an invalid Space id");
  if (typeof space.name !== "string" || !space.name.trim() || Buffer.byteLength(space.name) > 80)
    return yield* invalidInput("the export contains an invalid Space name");
  if (space.kind !== "smart" && space.kind !== "regular")
    return yield* invalidInput("the export contains an unsupported Space kind");
  const query = parseJson<unknown>(space.query, null);
  if (!Predicate.isObject(query))
    return yield* invalidInput("the export contains an invalid Space query");
  // Older exports can carry a pin filter; it is accepted and dropped with pins.
  if (Object.keys(query).some((field) => !["text", "kind", "tag", "favorite"].includes(field)))
    return yield* invalidInput("the export contains an unsupported Space query field");
  return { ...space, query: JSON.stringify(yield* validateSmartQuery(query)) };
});

// Records each directory in `moved` as soon as it lands, so a later failure
// can remove every one already moved into the library.
async function moveStagedAssets(
  stageRoot: string,
  assetsDirectory: string,
  items: ReadonlyArray<ImportedItem>,
  moved: string[],
) {
  const movedItemIds: string[] = [];
  for (const item of items) {
    const stagedAssets = join(stageRoot, "assets", "items", item.id);
    const targetAssets = join(assetsDirectory, item.id);
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
      moved.push(targetAssets);
      movedItemIds.push(item.id);
    } else if (item.local_asset_path || item.thumbnail_path) {
      reject(`asset files for item ${item.id} could not be staged`);
    }
  }
  return movedItemIds;
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
    items: ReadonlyArray<ImportedItem>,
    spaces: ReadonlyArray<ImportedSpace>,
    memberships: ReadonlyArray<Membership>,
    exclusions: ReadonlyArray<Exclusion>,
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
    // Opening migrates the staged copy to the current schema before it is read.
    yield* Effect.try({
      try: () => openDatabase(stageDatabase).db.close(),
      catch: (cause) => cause,
    });
    const stage = yield* withDatabaseFile({ filename: stageDatabase, disableWAL: true }, (staged) =>
      Effect.all({
        items: staged<ImportedItem>`SELECT id, kind, title, description, body, body_format,
          source_url, source_label, local_asset_path, thumbnail_path, ocr_text, metadata,
          created_at, updated_at, archived, favorite FROM items ORDER BY created_at, id`,
        spaces: staged<ImportedSpace>`SELECT * FROM spaces ORDER BY position, created_at, id`,
        memberships: staged<Membership>`SELECT space_id, item_id, added_at FROM space_items
          ORDER BY added_at, space_id, item_id`,
        exclusions: staged<Exclusion>`SELECT space_id, item_id, excluded_at FROM space_exclusions`,
      }),
    );
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
    const newItems = items.filter((item) => !existingItemIds.has(item.id));
    yield* attempt(() =>
      stageExportAssets(
        exportRoot,
        stageRoot,
        newItems.map((item) => item.id),
      ),
    );
    const unverifiedAssetFiles = yield* attempt(() =>
      verifyExportAssets(exportRoot, manifest, items, actualPaths),
    );

    const movedAssetDirectories: string[] = [];
    const movedItemIds = yield* attempt(() =>
      moveStagedAssets(stageRoot, ctx.assetsDirectory, newItems, movedAssetDirectories),
    ).pipe(Effect.tapError(() => removeDirectories(movedAssetDirectories)));
    const assetFilesByItem = new Map(
      movedItemIds.map((id) => [id, assetFileCounts.get(id) ?? 0] as const),
    );

    const report = yield* sql
      .withTransaction(insertStaged(items, spaces, memberships, exclusions, assetFilesByItem))
      .pipe(Effect.tapError(() => removeDirectories(movedAssetDirectories)));
    return { ...report, unverifiedAssetFiles } satisfies LibraryImportReport;
  });

  const importLibrary = Effect.fnUntraced(function* (exportDirectory: string) {
    const exportRoot = yield* attempt(() => realpath(exportDirectory).catch(() => null));
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
    const header = yield* withDatabaseFile(
      { filename: sourceDatabasePath, readonly: true },
      (source) =>
        Effect.all({
          schemaVersion: source<{ user_version: number }>`PRAGMA user_version`.pipe(
            Effect.map(([row]) => row?.user_version),
          ),
          integrity: source<{ integrity_check: string }>`PRAGMA integrity_check`.pipe(
            Effect.map(([row]) => row?.integrity_check),
          ),
        }),
    );
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
