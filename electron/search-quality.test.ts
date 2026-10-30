import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openTestLibrary } from "./storage/test-library.ts";
import { seedSearchFile } from "./search-fixtures.ts";
import { CAPTION_MODEL, contentHash } from "./search-core.ts";
import { escapeFtsQuery, searchFloors, sqlLikePattern } from "./storage/search.ts";

test("literal query metacharacters cannot expand exact-match lanes", () => {
  expect(escapeFtsQuery('cat OR "dog"')).toBe('"cat" "OR" "dog"');
  expect(sqlLikePattern("100%_\\sale")).toBe("%100\\%\\_\\\\sale%");
  expect(searchFloors.image).toBeLessThan(searchFloors.text);
});

const vector = (score = 1) => {
  const result = new Float32Array(768);
  result[0] = score;
  result[1] = Math.sqrt(1 - score ** 2);
  return result;
};

test("visual near-misses do not survive fusion; lexical results remain independent", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-search-quality-"));
  const lib = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    for (const [id, score] of [
      ["target", 0.732],
      ["near-miss", 0.668],
      ["second-target", 0.725],
    ] as const) {
      await seedSearchFile(lib, root, {
        id,
        fileName: `${id}.png`,
        kind: "image",
        bytes: new Uint8Array([1]),
      });
      const input = await lib.searchInput(id);
      await lib.storeSearchIndex(
        id,
        input!.revision,
        [],
        [{ kind: "image", chunkId: "image:fixture", vector: vector(score) }],
      );
    }
    expect((await lib.searchItems("category", 20, { current: vector() })).map((x) => x.id)).toEqual(
      ["target", "second-target"],
    );
    const note = await lib.createNote({ title: "category", body: "User-authored exact match" });
    expect(
      (await lib.searchItems("category", 20, { current: vector() })).map((x) => x.id),
    ).toContain(note.id);
  } finally {
    await lib.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("recaption and tag edits cannot revive vectors from replaced image bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-recaption-replacement-"));
  const lib = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    for (const partial of [false, true]) {
      const id = partial ? "partial" : "failed";
      await seedSearchFile(lib, root, {
        id,
        fileName: "neutral.png",
        kind: "image",
        bytes: new Uint8Array([1]),
      });
      const original = await lib.searchInput(id);
      await lib.storeSearchIndex(
        id,
        original!.revision,
        [],
        [{ kind: "image", chunkId: "image:old-bytes", vector: vector() }],
      );
      const replacement = await seedSearchFile(lib, root, {
        id,
        fileName: "neutral.png",
        kind: "image",
        bytes: new Uint8Array([2]),
      });
      const input = await lib.searchInput(id);
      if (partial) await lib.storeSearchImage(id, input!.revision, vector(0), "new-bytes");
      await lib.storeSearchAnnotation(id, replacement.localAssetPath!, "A new object", ["object"]);
      await lib.removeSearchTag(id, "object");
      const current = await lib.searchInput(id);
      const old = lib.db
        .prepare("SELECT revision FROM search_vectors WHERE item_id = ? AND chunk_id = ?")
        .get(id, "image:old-bytes");
      expect(old?.revision).not.toBe(current!.revision);
      expect(
        (await lib.searchItems("unmentioned category", 20, { current: vector() })).map((x) => x.id),
      ).not.toContain(id);
      if (partial) {
        const fresh = lib.db
          .prepare("SELECT revision FROM search_vectors WHERE item_id = ? AND chunk_id = ?")
          .get(id, "image:new-bytes");
        expect(fresh?.revision).toBe(current!.revision);
      }
    }
  } finally {
    await lib.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("caption version migrates in the background without invalidating unchanged image vectors or user text", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-recaption-"));
  const lib = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    const bytes = new Uint8Array([1, 2, 3]);
    const item = await seedSearchFile(lib, root, { fileName: "neutral.png", kind: "image", bytes });
    await lib.updateItem({ id: item.id, addTag: "personal" });
    await lib.storeOcrText(item.id, "Receipt A314", "fixture");
    let input = await lib.searchInput(item.id);
    const hash = contentHash(bytes);
    await lib.storeSearchIndex(
      item.id,
      input!.revision,
      [],
      [{ kind: "image", chunkId: `image:${hash}`, vector: vector() }],
    );
    await lib.storeSearchAnnotation(item.id, item.localAssetPath!, "A dog near a ball", [
      "dog",
      "ball",
    ]);
    expect((await lib.searchItems("animal", 10, { current: vector() })).map((x) => x.id)).toEqual([
      item.id,
    ]);
    expect(await lib.cachedSearchImage(item.id, hash)).toEqual(vector());
    await lib.removeSearchTag(item.id, "dog");
    lib.db
      .prepare("UPDATE search_ai SET model = ? WHERE item_id = ?")
      .run("florence2-base-ft-q8-v1", item.id);
    expect(await lib.nextCaptionCandidate()).toMatchObject({ id: item.id });
    await lib.storeSearchAnnotation(
      item.id,
      item.localAssetPath!,
      "A brown dog with a ball on grass",
      ["dog", "grass"],
    );
    expect((await lib.getSearchAnnotation(item.id))?.model).toBe(CAPTION_MODEL);
    expect((await lib.getSearchAnnotation(item.id))?.tags).toEqual(["grass"]);
    expect(await lib.nextCaptionCandidate()).toBeUndefined();
    expect((await lib.getItem(item.id))?.ocrText).toBe("Receipt A314");
    expect((await lib.getItem(item.id))?.metadata.tags).toEqual(["personal"]);
    expect(await lib.cachedSearchImage(item.id, hash)).toEqual(vector());
    expect((await lib.searchItems("animal", 10, { current: vector() })).map((x) => x.id)).toEqual([
      item.id,
    ]);
  } finally {
    await lib.close();
    rmSync(root, { recursive: true, force: true });
  }
});
