import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLibraryAsset } from "./library-asset.ts";

const root = await mkdtemp(join(tmpdir(), "inkling-library-asset-"));
const assets = join(root, "library", "assets");
await mkdir(join(assets, "items", "a"), { recursive: true });
await writeFile(join(assets, "items", "a", "photo.jpg"), "jpg");
await writeFile(join(root, "secret.txt"), "outside");
await symlink(join(root, "secret.txt"), join(assets, "items", "a", "escape.txt"));
afterAll(() => rm(root, { recursive: true, force: true }));

test("show in folder reveals only a real file inside the library's assets", async () => {
  expect(await resolveLibraryAsset(assets, "assets/items/a/photo.jpg")).toEndWith(
    join("items", "a", "photo.jpg"),
  );
  expect(await resolveLibraryAsset(assets, "assets\\items\\a\\photo.jpg")).toEndWith("photo.jpg");
  for (const path of [
    "assets/items/a/../../../secret.txt",
    "assets/items/a/escape.txt",
    "assets/items/a/missing.jpg",
    "assets//items/a/photo.jpg",
    "assets/C:/secret.txt",
    "items/a/photo.jpg",
    join(assets, "items", "a", "photo.jpg"),
    "",
  ]) {
    expect(await resolveLibraryAsset(assets, path)).toBeNull();
  }
});
