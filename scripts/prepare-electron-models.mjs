import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { downloadModelAsset, hasSha256 } from "../electron/model-assets.ts";
import manifest from "../electron/model-manifest.json" with { type: "json" };

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDirectory = join(repositoryRoot, ".artifacts/electron-model-cache/models");
const bundledModelsDirectory = join(repositoryRoot, ".artifacts/electron-resources/models");

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
  return (await hasSha256(path, asset.sha256)) ? path : downloadModelAsset(path, asset);
}

const assets = [
  [manifest.text.name, manifest.text.model],
  [manifest.text.name, manifest.text.tokenizer],
  [manifest.image.name, manifest.image.model],
];

await rm(bundledModelsDirectory, { recursive: true, force: true });
for (const [modelName, asset] of assets) {
  const cachedPath = await ensureCachedAsset(modelName, asset);
  const bundledPath = assetPath(bundledModelsDirectory, modelName, asset.path);
  await mkdir(dirname(bundledPath), { recursive: true });
  await copyFile(cachedPath, bundledPath);
}

console.log(`Staged ${assets.length} pinned embedding assets for electron-builder.`);
