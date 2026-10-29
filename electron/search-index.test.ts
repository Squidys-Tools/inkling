import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openTestLibrary } from "./storage/test-library.ts";
import { IMAGE_MODEL, TEXT_MODEL } from "./embedding-contract.ts";
import { floatVectorBytes } from "./embeddings.ts";
import { SEARCH_INDEX, textChunks } from "./search-core.ts";

const unit = () => {
  const vector = new Float32Array(768);
  vector[0] = 1;
  return vector;
};

test("versioned index preserves legacy vectors, refuses stale writes, and smart Spaces use chunk search", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-search-index-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    const item = await library.createNote({ title: "Unlabeled notes", body: "Original body" });
    await library.storeEmbedding(item.id, "text", TEXT_MODEL, floatVectorBytes(unit()), 768);
    const input = await library.searchInput(item.id);
    expect(input).not.toBeNull();
    if (!input) throw new Error("missing search input");
    await library.updateItem({ id: item.id, body: "Changed while inference runs" });
    expect(
      await library.storeSearchIndex(item.id, input.revision, input.chunks, [
        { kind: "text", chunkId: "old", vector: unit() },
      ]),
    ).toBe(false);
    expect(library.db.prepare("SELECT COUNT(*) AS n FROM item_embeddings").get()?.n).toBe(1);
    const next = await library.searchInput(item.id);
    if (!next) throw new Error("missing input");
    const chunks = textChunks("The blue archive key is below the observatory stairs.", "pdf", 7);
    expect(
      await library.storeSearchIndex(item.id, next.revision, chunks, [
        { kind: "text", chunkId: chunks[0].id, vector: unit() },
      ]),
    ).toBe(true);
    expect((await library.searchItems("observatory stairs")).map((x) => x.id)).toEqual([item.id]);
    const space = await library.createSpace({
      name: "Saved memory",
      query: { text: "observatory stairs" },
    });
    expect((await library.listSpaceItems(space.id)).map((x) => x.id)).toEqual([item.id]);
    expect(
      (await library.searchItems("remembered place", 10, { current: unit() })).map((x) => x.id),
    ).toEqual([item.id]);
    const progress = await library.searchIndexProgress();
    expect(progress).toEqual({ total: 1, ready: 1, index: SEARCH_INDEX });
    await library.updateItem({ id: item.id, body: "Replacement" });
    expect(await library.searchItems("observatory stairs")).toEqual([]);
    expect(
      (await library.searchItems("old fallback", 10, { legacy: unit() })).map((x) => x.id),
    ).toEqual([item.id]);
  } finally {
    await library.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("derived tags are separate from user tags and OCR, removal survives recaptioning and archive deletes indexes", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-search-tags-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    const item = await library.saveFile({
      fileName: "photo.png",
      bytes: new Uint8Array([1, 2, 3]),
      kind: "image",
    });
    if (!item.localAssetPath) throw new Error("asset missing");
    await library.updateItem({ id: item.id, addTag: "personal" });
    await library.storeOcrText(item.id, "Exact receipt number A314", "test");
    await library.storeEmbedding(item.id, "image", IMAGE_MODEL, floatVectorBytes(unit()), 768);
    expect(
      await library.storeSearchAnnotation(item.id, item.localAssetPath, "A dog by a ball.", [
        "dog",
        "ball",
      ]),
    ).toBe(true);
    await library.removeSearchTag(item.id, "dog");
    await library.storeSearchAnnotation(item.id, item.localAssetPath, "A dog near a ball.", [
      "dog",
      "ball",
    ]);
    expect((await library.getSearchAnnotation(item.id))?.tags).toEqual(["ball"]);
    const detail = await library.getItem(item.id);
    expect(detail?.metadata.tags).toEqual(["personal"]);
    expect(detail?.ocrText).toBe("Exact receipt number A314");
    const exports = join(root, "exports");
    mkdirSync(exports);
    const exported = await library.exportLibrary(exports, 0);
    const restored = await openTestLibrary(join(root, "restored", "library.sqlite3"));
    try {
      await restored.importLibrary(exported.directory);
      expect((await restored.getSearchAnnotation(item.id))?.tags).toEqual(["ball"]);
      expect((await restored.getItem(item.id))?.metadata.tags).toEqual(["personal"]);
      expect((await restored.getItem(item.id))?.ocrText).toBe("Exact receipt number A314");
    } finally {
      await restored.close();
    }
    const input = await library.searchInput(item.id);
    if (!input) throw new Error("input missing");
    await library.storeSearchImage(item.id, input.revision, unit(), "hash");
    expect(await library.cachedSearchImage(item.id, "hash")).toEqual(unit());
    await library.storeSearchIndex(item.id, input.revision, input.chunks, [
      { kind: "image", chunkId: "image:hash", vector: unit() },
    ]);
    await library.archiveItem(item.id, true);
    expect(await library.searchItems("dog", 10, { current: unit() })).toEqual([]);
    await library.deleteItem(item.id);
    for (const table of [
      "search_vectors",
      "search_chunks",
      "search_ai",
      "search_pages",
      "search_index_state",
      "search_chunks_fts",
    ])
      expect(library.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n).toBe(0);
  } finally {
    await library.close();
    rmSync(root, { recursive: true, force: true });
  }
});
