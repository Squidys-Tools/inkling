import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLibrarySizeCache } from "./library-size.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function library() {
  const root = await mkdtemp(join(tmpdir(), "inkling-size-"));
  roots.push(root);
  const database = join(root, "library.sqlite");
  const assets = join(root, "assets");
  await writeFile(database, Buffer.alloc(100));
  await mkdir(join(assets, "items", "a"), { recursive: true });
  await writeFile(join(assets, "items", "a", "original.png"), Buffer.alloc(50));
  return { database, assets, cache: createLibrarySizeCache(database, assets) };
}

test("library size answers from the last walk until a refresh is asked for", async () => {
  const { assets, cache } = await library();
  expect(await cache.get()).toEqual({ bytes: 150 });

  await writeFile(join(assets, "items", "a", "thumbnail.webp"), Buffer.alloc(25));
  expect(await cache.get()).toEqual({ bytes: 150 });
  expect(await cache.get({ refresh: true })).toEqual({ bytes: 175 });
  expect(await cache.get()).toEqual({ bytes: 175 });
});

test("library size keeps answering from cache while a refresh walks", async () => {
  const { assets, cache } = await library();
  await cache.get();
  await writeFile(join(assets, "items", "a", "thumbnail.webp"), Buffer.alloc(25));

  const refreshing = cache.get({ refresh: true });
  expect(await cache.get()).toEqual({ bytes: 150 });
  expect(await refreshing).toEqual({ bytes: 175 });
});

test("library size shares one walk between overlapping first calls", async () => {
  const { cache } = await library();
  const first = cache.get();
  const refresh = cache.get({ refresh: true });
  expect(refresh).toBe(first);
  expect(await first).toEqual({ bytes: 150 });
});

test("library size counts a library with no files yet as empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "inkling-size-"));
  roots.push(root);
  const cache = createLibrarySizeCache(join(root, "library.sqlite"), join(root, "assets"));
  expect(await cache.get()).toEqual({ bytes: 0 });
});
