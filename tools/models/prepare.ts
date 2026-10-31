import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  downloadModelAsset,
  hasSha256,
  type ModelAsset,
} from "../../packages/jobs/src/model-assets.ts";
import manifest from "../../packages/jobs/src/model-manifest.json" with { type: "json" };

// Stages the pinned embedding models for electron-builder's extraResources, so
// the packaged app never downloads them. Downloads land in a cache that later
// runs reuse once their SHA-256 matches.
const workspace = resolve(import.meta.dir, "../..");
const cacheDirectory = join(workspace, ".artifacts/electron-model-cache/models");
const bundledModelsDirectory = join(workspace, ".artifacts/electron-resources/models");

function assetPath(root: string, modelName: string, path: string) {
  if (!modelName || isAbsolute(path) || path.split(/[\\/]/).some((part) => part === "..")) {
    throw new Error("Model manifest contains an unsafe asset path.");
  }
  const resolved = resolve(root, modelName, path);
  if (!resolved.startsWith(`${root}${sep}`))
    throw new Error("Model asset escaped its root directory.");
  return resolved;
}

async function ensureCachedAsset(modelName: string, asset: ModelAsset) {
  const path = assetPath(cacheDirectory, modelName, asset.path);
  return (await hasSha256(path, asset.sha256)) ? path : downloadModelAsset(path, asset);
}

const assets: [string, ModelAsset][] = [
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
