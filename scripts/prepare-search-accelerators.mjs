import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".artifacts/electron-resources/accelerators/cuda");
const source = process.env.INKLING_CUDA_RUNTIME_DIR;
const manifest = JSON.parse(
  await readFile(join(root, "electron/search-accelerators.json"), "utf8"),
);
const hashFile = async (path) => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};
// This opt-in is a BUILD input only, never a renderer-controlled search path.
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
if (source && process.platform === manifest.platform && process.arch === manifest.arch) {
  const require = createRequire(import.meta.url);
  const ort = dirname(require.resolve("onnxruntime-node/package.json"));
  const provider = join(ort, "bin/napi-v6/linux/x64", manifest.provider.file);
  if (!existsSync(provider)) {
    execFileSync(
      process.execPath,
      [join(ort, "script/install.js"), "--onnxruntime-node-install=cuda12"],
      { stdio: "inherit" },
    );
  }
  if ((await hashFile(provider)) !== manifest.provider.sha256)
    throw new Error("Unpinned ONNX CUDA provider");
  for (const file of manifest.files) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file.name)) throw new Error("Unsafe accelerator filename");
    const path = join(resolve(source), file.name);
    if ((await hashFile(path)) !== file.sha256)
      throw new Error(`Accelerator checksum failed: ${file.name}`);
    await copyFile(path, join(target, file.name));
  }
  await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("Staged pinned optional NVIDIA runtime and original license texts.");
} else {
  console.log("No optional CUDA bundle supplied; installed runtime providers or CPU will be used.");
}
