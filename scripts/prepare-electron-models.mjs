import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(repositoryRoot, "electron/model-manifest.json"), "utf8"),
);
const searchManifest = JSON.parse(
  await readFile(join(repositoryRoot, "electron/search-model-manifest.json"), "utf8"),
);
const cacheDirectory = join(repositoryRoot, ".artifacts/electron-model-cache/models");
const bundledModelsDirectory = join(repositoryRoot, ".artifacts/electron-resources/models");

async function sha256(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function assetPath(root, modelName, assetPathValue) {
  if (
    !modelName ||
    isAbsolute(assetPathValue) ||
    assetPathValue.split(/[\\/]/).some((part) => part === "..")
  ) {
    throw new Error("Model manifest contains an unsafe asset path.");
  }
  const path = resolve(root, modelName, assetPathValue);
  if (!path.startsWith(`${root}${sep}`)) throw new Error("Model asset escaped its root directory.");
  return path;
}

async function ensureCachedAsset(modelName, asset) {
  const path = assetPath(cacheDirectory, modelName, asset.path);
  const exists = await stat(path).then(
    () => true,
    () => false,
  );
  if (exists && (await sha256(path)) === asset.sha256) return path;
  if (exists) await rm(path, { force: true });

  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.${process.pid}.part`;
  try {
    const response = await fetch(asset.url);
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed with HTTP ${response.status}.`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(partialPath, { flags: "wx" }),
    );
    if ((await sha256(partialPath)) !== asset.sha256) {
      throw new Error(`Model asset failed its SHA-256 check: ${modelName}/${asset.path}`);
    }
    await rename(partialPath, path);
    return path;
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}

const assets = [
  [manifest.text.name, manifest.text.model],
  [manifest.text.name, manifest.text.tokenizer],
  [manifest.image.name, manifest.image.model],
  ...Object.values(searchManifest).flatMap((group) =>
    group.assets.map((asset) => [group.repo, asset]),
  ),
];

await rm(bundledModelsDirectory, { recursive: true, force: true });
for (const [modelName, asset] of assets) {
  const cachedPath = await ensureCachedAsset(modelName, asset);
  const bundledPath = assetPath(bundledModelsDirectory, modelName, asset.path);
  await mkdir(dirname(bundledPath), { recursive: true });
  await copyFile(cachedPath, bundledPath);
}

console.log(`Staged ${assets.length} pinned embedding assets for electron-builder.`);
