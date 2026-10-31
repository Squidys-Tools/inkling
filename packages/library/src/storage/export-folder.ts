import { copyFile, lstat, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { SCHEMA_VERSION } from "./schema.ts";
import { isMissing, parseJson, sha256File } from "./shared.ts";

export type Manifest = {
  format?: unknown;
  formatVersion?: unknown;
  schemaVersion?: unknown;
  counts?: { items?: unknown; spaces?: unknown; assetFiles?: unknown; skippedAssets?: unknown };
  skippedAssets?: unknown[];
  assetFiles?: { path?: unknown; byteLength?: unknown; sha256?: unknown }[];
};

type ExportedItem = {
  id: string;
  local_asset_path: string | null;
  thumbnail_path: string | null;
  metadata: string;
};

export const reject = (detail: string): never => {
  throw new Error(`invalid storage input: ${detail}`);
};

export async function collectAssetFiles(
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

async function copyAssetDirectory(source: string, destination: string) {
  const info = await lstat(source).catch((error) =>
    isMissing(error) ? null : Promise.reject(error),
  );
  if (!info) return;
  if (!info.isDirectory() || info.isSymbolicLink())
    reject("the export contains an unsafe item asset folder");
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) reject("the export contains a symbolic link in its asset files");
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyAssetDirectory(from, to);
    else if (entry.isFile()) await copyFile(from, to);
    else reject("the export contains an unsupported asset file");
  }
}

// Copies the assets of the given items from an export into the staging folder,
// refusing symbolic links and anything that is not a file or directory.
export async function stageExportAssets(
  exportRoot: string,
  stageRoot: string,
  itemIds: ReadonlyArray<string>,
) {
  for (const itemId of itemIds) {
    const source = join(exportRoot, "assets", "items", itemId);
    const isDirectory = await lstat(source).then(
      (info) => info.isDirectory(),
      () => false,
    );
    if (isDirectory) await copyAssetDirectory(source, join(stageRoot, "assets", "items", itemId));
  }
}

export async function readManifest(exportRoot: string): Promise<Manifest> {
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
export async function verifyExportAssets(
  exportRoot: string,
  manifest: Manifest,
  items: ReadonlyArray<ExportedItem>,
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
