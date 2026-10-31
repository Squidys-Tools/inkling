import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export type ModelAsset = { path: string; url: string; sha256: string };

export const hasSha256 = (path: string, expected: string) =>
  sha256File(path).then(
    (hash) => hash === expected,
    () => false,
  );

// The bytes land beside the target and move into place only once they verify,
// so an interrupted download never leaves a file that passes for cached.
export async function downloadModelAsset(path: string, { url, sha256: expectedHash }: ModelAsset) {
  await rm(path, { force: true });
  await mkdir(dirname(path), { recursive: true });
  const partialPath = `${path}.${process.pid}.part`;
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`model download failed with HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
      createWriteStream(partialPath, { flags: "wx" }),
    );
    if ((await sha256File(partialPath)) !== expectedHash) {
      throw new Error("model asset failed its SHA-256 check");
    }
    await rename(partialPath, path);
    return path;
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }
}
