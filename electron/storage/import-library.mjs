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
import { IMAGE_THUMBNAIL_JOB, VIDEO_POSTER_JOB } from "./jobs.mjs";
import { openDatabase, SCHEMA_VERSION } from "./schema.mjs";
import { normalizeSpaceColor, validateSmartQuery } from "./spaces.mjs";
import { isInside, parseJson, sha256File, validateItemId } from "./shared.mjs";

function parseImportedSpaceQuery(serialized) {
  let query;
  try {
    query = JSON.parse(serialized);
  } catch {
    throw new Error("invalid storage input: the export contains an invalid Space query");
  }
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new Error("invalid storage input: the export contains an invalid Space query");
  // Older exports can carry a pin filter; it is accepted and dropped with pins.
  if (Object.keys(query).some((field) => !["text", "kind", "tag", "favorite"].includes(field)))
    throw new Error("invalid storage input: the export contains an unsupported Space query field");
  return validateSmartQuery(query);
}

function validateImportedSpace(space) {
  if (validateItemId(space.id) !== space.id)
    throw new Error("invalid storage input: the export contains an invalid Space id");
  if (typeof space.name !== "string" || !space.name.trim() || Buffer.byteLength(space.name) > 80) {
    throw new Error("invalid storage input: the export contains an invalid Space name");
  }
  if (space.kind !== "smart" && space.kind !== "regular")
    throw new Error("invalid storage input: the export contains an unsupported Space kind");
  return { ...space, query: JSON.stringify(parseImportedSpaceQuery(space.query)) };
}

function readImportStage(databasePath) {
  // Opening migrates the staged copy to the current schema before it is read.
  const stage = openDatabase(databasePath);
  try {
    return {
      items: stage.db
        .prepare(`SELECT id, kind, title, description, body, body_format, source_url,
        source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
        archived, favorite FROM items ORDER BY created_at, id`)
        .all(),
      spaces: stage.db
        .prepare("SELECT * FROM spaces ORDER BY position, created_at, id")
        .all()
        .map(validateImportedSpace),
      memberships: stage.db
        .prepare(
          "SELECT space_id, item_id, added_at FROM space_items ORDER BY added_at, space_id, item_id",
        )
        .all(),
    };
  } finally {
    stage.db.close();
  }
}

async function collectAssetFiles(root, relativeDirectory = "assets/items", results = []) {
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw error;
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("invalid storage input: the export contains an unsafe asset directory");
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw new Error(
        "invalid storage input: the export contains a symbolic link in its asset files",
      );
    if (entry.isDirectory()) await collectAssetFiles(path, relativePath, results);
    else if (entry.isFile()) results.push(relativePath);
    else throw new Error("invalid storage input: the export contains an unsupported asset file");
  }
  return results;
}

async function verifyExportAsset(exportDirectory, itemId, relativePath) {
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
    throw new Error(
      `invalid storage input: the export contains an unsafe asset path for item ${itemId}`,
    );
  }
  let path = join(exportDirectory, "assets", "items", itemId);
  for (const [index, component] of components.slice(3).entries()) {
    path = join(path, component);
    let info;
    try {
      info = await lstat(path);
    } catch {
      throw new Error(
        `invalid storage input: the export is missing a referenced asset: ${relativePath}`,
      );
    }
    if (
      info.isSymbolicLink() ||
      (index === components.length - 4 ? !info.isFile() : !info.isDirectory())
    ) {
      throw new Error(
        `invalid storage input: the export contains an unsafe or invalid asset: ${relativePath}`,
      );
    }
  }
  return path;
}

async function copyAssetDirectory(source, destination) {
  const info = await lstat(source).catch((error) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (!info) return 0;
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("invalid storage input: the export contains an unsafe item asset folder");
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(
        "invalid storage input: the export contains a symbolic link in its asset files",
      );
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) count += await copyAssetDirectory(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      count += 1;
    } else throw new Error("invalid storage input: the export contains an unsupported asset file");
  }
  return count;
}

export const importMethods = {
  async importLibrary(exportDirectory) {
    const exportRoot = await realpath(String(exportDirectory ?? "")).catch(() => null);
    if (!exportRoot)
      throw new Error("invalid storage input: choose an existing Inkling export folder");
    const exportInfo = await stat(exportRoot);
    if (!exportInfo.isDirectory())
      throw new Error("invalid storage input: choose an existing Inkling export folder");
    const libraryDirectory = dirname(this.databasePath);
    const assetsRoot = await realpath(this.assetsRoot).catch(() => this.assetsRoot);
    if (isInside(exportRoot, assetsRoot))
      throw new Error("choose an export folder outside inkling's asset store");
    const manifestPath = join(exportRoot, "manifest.json");
    const manifestInfo = await lstat(manifestPath).catch(() => null);
    if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink())
      throw new Error("invalid storage input: the selected folder is missing manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.format !== "inkling-export" || manifest.formatVersion !== 1) {
      throw new Error(
        "invalid storage input: the selected folder is not a supported Inkling export",
      );
    }
    if (manifest.schemaVersion < 1 || manifest.schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        "invalid storage input: the export was created by an unsupported library version",
      );
    }
    if (
      Number(manifest.counts?.skippedAssets ?? 0) !== 0 ||
      (manifest.skippedAssets ?? []).length > 0
    ) {
      const count = Math.max(
        Number(manifest.counts?.skippedAssets ?? 0),
        (manifest.skippedAssets ?? []).length,
      );
      throw new Error(
        `invalid storage input: this export is incomplete: ${count} asset files were skipped during export; create a complete export before restoring it`,
      );
    }
    const sourceDatabasePath = join(exportRoot, "library.sqlite3");
    const databaseInfo = await lstat(sourceDatabasePath).catch(() => null);
    if (!databaseInfo?.isFile() || databaseInfo.isSymbolicLink())
      throw new Error("invalid storage input: library.sqlite3 must be a regular file");
    const sourceDb = new DatabaseSync(sourceDatabasePath, { readOnly: true });
    let schemaVersion;
    let integrity;
    try {
      schemaVersion = sourceDb.prepare("PRAGMA user_version").get().user_version;
      integrity = sourceDb.prepare("PRAGMA integrity_check").get().integrity_check;
    } finally {
      sourceDb.close();
    }
    if (schemaVersion !== manifest.schemaVersion)
      throw new Error("invalid storage input: the export manifest does not match its database");
    if (integrity !== "ok")
      throw new Error("invalid storage input: the export database failed its integrity check");

    const stageRoot = await mkdtemp(join(libraryDirectory, ".inkling-import-"));
    const stageDatabase = join(stageRoot, "library.sqlite3");
    const movedAssetDirectories = [];
    try {
      await copyFile(sourceDatabasePath, stageDatabase);
      const { items, spaces, memberships } = readImportStage(stageDatabase);
      if (
        items.length !== Number(manifest.counts?.items) ||
        spaces.length !== Number(manifest.counts?.spaces)
      ) {
        throw new Error(
          "invalid storage input: the export manifest counts do not match its database",
        );
      }
      for (const item of items) {
        if (validateItemId(item.id) !== item.id)
          throw new Error("invalid storage input: the export contains an unsafe item id");
        try {
          item.metadata = JSON.stringify(JSON.parse(item.metadata));
        } catch {
          throw new Error("invalid storage input: the export contains invalid item metadata");
        }
      }
      const itemIds = new Set(items.map((item) => item.id));
      const spaceIds = new Set(spaces.map((space) => space.id));
      if (
        memberships.some(
          (membership) => !spaceIds.has(membership.space_id) || !itemIds.has(membership.item_id),
        )
      ) {
        throw new Error("invalid storage input: the export contains incomplete Space memberships");
      }
      const existingItemIds = new Set(
        this.db
          .prepare("SELECT id FROM items")
          .all()
          .map((row) => row.id),
      );
      const actualPaths = await collectAssetFiles(join(exportRoot, "assets", "items")).catch(
        (error) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );
      const assetFileCounts = new Map();
      for (const path of actualPaths) {
        const itemId = path.split("/")[2];
        assetFileCounts.set(itemId, (assetFileCounts.get(itemId) ?? 0) + 1);
      }
      for (const itemId of itemIds) {
        if (existingItemIds.has(itemId)) continue;
        const source = join(exportRoot, "assets", "items", itemId);
        const destination = join(stageRoot, "assets", "items", itemId);
        if (
          await lstat(source).then(
            (info) => info.isDirectory(),
            () => false,
          )
        ) {
          await copyAssetDirectory(source, destination);
        }
      }
      for (const item of items) {
        for (const assetPath of [item.local_asset_path, item.thumbnail_path].filter(Boolean)) {
          await verifyExportAsset(exportRoot, item.id, assetPath);
          if (item.local_asset_path === assetPath) {
            const expected = parseJson(item.metadata, {}).byteLength;
            if (
              expected != null &&
              (await stat(await verifyExportAsset(exportRoot, item.id, assetPath))).size !==
                Number(expected)
            ) {
              throw new Error(
                `invalid storage input: the export contains a damaged asset with an unexpected size: ${assetPath}`,
              );
            }
          }
        }
      }
      if (Number(manifest.counts?.assetFiles) !== actualPaths.length) {
        throw new Error(
          "invalid storage input: the export manifest asset count does not match its files",
        );
      }
      let unverifiedAssetFiles = actualPaths.length;
      if (Array.isArray(manifest.assetFiles)) {
        if (manifest.assetFiles.length !== actualPaths.length)
          throw new Error(
            "invalid storage input: the export manifest asset list does not match its files",
          );
        const listedPaths = new Set();
        for (const asset of manifest.assetFiles) {
          const components = String(asset.path).split("/");
          const assetItemId = components[2];
          if (!itemIds.has(assetItemId) || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
            throw new Error(
              "invalid storage input: the export manifest contains an invalid asset entry",
            );
          }
          const path = await verifyExportAsset(exportRoot, assetItemId, asset.path);
          if (
            (await stat(path)).size !== Number(asset.byteLength) ||
            (await sha256File(path)).toLowerCase() !== asset.sha256.toLowerCase()
          ) {
            throw new Error(
              `invalid storage input: the export contains a damaged asset: ${asset.path}`,
            );
          }
          if (listedPaths.has(asset.path))
            throw new Error(
              "invalid storage input: the export manifest contains a duplicate asset path",
            );
          listedPaths.add(asset.path);
        }
        if (actualPaths.some((path) => !listedPaths.has(path)))
          throw new Error(
            "invalid storage input: the export manifest asset list does not match its files",
          );
        for (const item of items) {
          for (const path of [item.local_asset_path, item.thumbnail_path].filter(Boolean)) {
            if (!listedPaths.has(path))
              throw new Error(
                `invalid storage input: the export manifest is missing an integrity record for asset: ${path}`,
              );
          }
        }
        unverifiedAssetFiles = 0;
      }

      const assetFilesByItem = new Map();
      try {
        for (const item of items) {
          if (existingItemIds.has(item.id)) continue;
          const stagedAssets = join(stageRoot, "assets", "items", item.id);
          const targetAssets = join(this.assetsDirectory, item.id);
          const stagedInfo = await lstat(stagedAssets).catch((error) =>
            error.code === "ENOENT" ? null : Promise.reject(error),
          );
          if (stagedInfo?.isDirectory()) {
            if (
              await lstat(targetAssets).then(
                () => true,
                () => false,
              )
            ) {
              throw new Error(
                `invalid storage input: asset files already exist for item ${item.id}; refusing to overwrite them`,
              );
            }
            await mkdir(dirname(targetAssets), { recursive: true });
            await rename(stagedAssets, targetAssets);
            movedAssetDirectories.push(targetAssets);
            assetFilesByItem.set(item.id, assetFileCounts.get(item.id) ?? 0);
          } else if (item.local_asset_path || item.thumbnail_path) {
            throw new Error(
              `invalid storage input: asset files for item ${item.id} could not be staged`,
            );
          }
        }
      } catch (error) {
        for (const directory of movedAssetDirectories)
          await rm(directory, { recursive: true, force: true });
        throw error;
      }
      const importedItemIds = new Set();
      const importedSpaceIds = new Set();
      let assetFiles = 0;
      let importedItems = 0;
      let skippedDuplicateItems = 0;
      let importedSpaces = 0;
      let skippedDuplicateSpaces = 0;
      try {
        this.db.exec("BEGIN IMMEDIATE");
        const currentItemIds = new Set(
          this.db
            .prepare("SELECT id FROM items")
            .all()
            .map((row) => row.id),
        );
        const currentSpaceIds = new Set(
          this.db
            .prepare("SELECT id FROM spaces")
            .all()
            .map((row) => row.id),
        );
        for (const item of items) {
          if (currentItemIds.has(item.id)) {
            if (assetFilesByItem.has(item.id)) {
              throw new Error("the active library changed while the export was being checked");
            }
            skippedDuplicateItems += 1;
            continue;
          }
          this.db
            .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, source_url,
            source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at, archived, favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
              item.id,
              item.kind,
              item.title,
              item.description,
              item.body ?? "",
              item.body_format ?? "md",
              item.source_url,
              item.source_label,
              item.local_asset_path,
              item.thumbnail_path,
              item.ocr_text,
              item.metadata,
              item.created_at,
              item.updated_at,
              item.archived,
              item.favorite,
            );
          if (item.kind === "image") this.jobs.enqueue(item.id, "ocr_image", { notify: false });
          if (item.kind === "image" && !item.thumbnail_path)
            this.jobs.enqueue(item.id, IMAGE_THUMBNAIL_JOB, { notify: false });
          if (item.kind === "pdf") this.jobs.enqueue(item.id, "ocr_pdf_page", { notify: false });
          if (item.kind === "video" && !item.thumbnail_path)
            this.jobs.enqueue(item.id, VIDEO_POSTER_JOB, { notify: false });
          this.jobs.enqueue(item.id, "generate_embedding", { notify: false });
          importedItemIds.add(item.id);
          importedItems += 1;
          assetFiles += assetFilesByItem.get(item.id) ?? 0;
        }
        let nextPosition = this.db
          .prepare("SELECT COALESCE(MAX(position), -1) AS value FROM spaces")
          .get().value;
        for (const space of spaces) {
          if (currentSpaceIds.has(space.id)) {
            skippedDuplicateSpaces += 1;
            continue;
          }
          nextPosition += 1;
          this.db
            .prepare(`INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
              space.id,
              space.name,
              normalizeSpaceColor(space.color),
              space.query,
              space.kind,
              nextPosition,
              space.created_at,
              space.updated_at,
            );
          importedSpaceIds.add(space.id);
          importedSpaces += 1;
        }
        for (const membership of memberships) {
          if (
            importedSpaceIds.has(membership.space_id) &&
            (importedItemIds.has(membership.item_id) || currentItemIds.has(membership.item_id))
          ) {
            this.db
              .prepare(
                "INSERT OR IGNORE INTO space_items (space_id, item_id, added_at) VALUES (?, ?, ?)",
              )
              .run(membership.space_id, membership.item_id, membership.added_at);
          }
        }
        this.db.exec("COMMIT");
      } catch (error) {
        if (this.db.isTransaction) this.db.exec("ROLLBACK");
        for (const directory of movedAssetDirectories)
          await rm(directory, { recursive: true, force: true });
        throw error;
      }
      for (const itemId of importedItemIds) this.jobs.notify(itemId);
      return {
        importedItems,
        skippedDuplicateItems,
        importedSpaces,
        skippedDuplicateSpaces,
        assetFiles,
        unverifiedAssetFiles,
      };
    } finally {
      // Bun keeps closed SQLite files locked until temporary statement wrappers finalize.
      if (typeof Bun !== "undefined") Bun.gc(true);
      await rm(stageRoot, { recursive: true, force: true });
    }
  },
};
