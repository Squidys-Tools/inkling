import { isInside } from "@inkling/library/paths";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * The file an item's stored `assets/...` path names, or null unless it is a
 * real file inside the library's assets folder. A path from the database is
 * checked like any input: no `..`, no drive letters, no link leading out.
 */
export async function resolveLibraryAsset(assetsDirectory: string, assetPath: string) {
  const normalized = assetPath.replaceAll("\\", "/");
  if (!normalized.startsWith("assets/")) return null;
  const parts = normalized.slice("assets/".length).split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":")))
    return null;
  const root = resolve(assetsDirectory);
  const candidate = resolve(root, ...parts);
  if (!isInside(candidate, root)) return null;
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(candidate)]);
    return isInside(realFile, realRoot) ? realFile : null;
  } catch {
    return null;
  }
}
