import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openTestLibrary } from "./storage/test-library.ts";
import { floatVectorBytes } from "./embeddings.ts";
import { TEXT_MODEL } from "./embedding-contract.ts";
import { SEARCH_INDEX } from "./search-core.ts";
const unit = () => {
  const v = new Float32Array(768);
  v[0] = 1;
  return v;
};

test("same-id same-filename replacement cannot resurrect previous caption, PDF pages or OCR", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-asset-generation-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    for (const kind of ["image", "pdf"] as const) {
      const original = await library.saveFile({
        id: kind,
        fileName: "same.bin",
        kind,
        bytes: Buffer.from("original bytes"),
      });
      const replacement = await library.saveFile({
        id: kind,
        fileName: "same.bin",
        kind,
        bytes: Buffer.from("replacement bytes"),
      });
      expect(replacement.localAssetPath).not.toBe(original.localAssetPath);
      expect(readFileSync(await library.resolveAssetPath(original.localAssetPath), "utf8")).toBe(
        "original bytes",
      );
      expect(readFileSync(await library.resolveAssetPath(replacement.localAssetPath), "utf8")).toBe(
        "replacement bytes",
      );
      if (!original.localAssetPath || !replacement.localAssetPath) throw Error("asset missing");
      if (kind === "image") {
        expect(
          await library.storeSearchAnnotation(kind, original.localAssetPath, "Old cat", ["cat"]),
        ).toBe(false);
        expect(await library.getSearchAnnotation(kind)).toBeNull();
        expect(await library.nextCaptionCandidate()).toMatchObject({ id: kind });
        expect(
          await library.storeSearchAnnotation(kind, replacement.localAssetPath, "New dog", ["dog"]),
        ).toBe(true);
      } else {
        expect(await library.storePdfPages(kind, original.localAssetPath, ["old document"])).toBe(
          false,
        );
        expect(
          library.db.prepare("SELECT count(*) AS n FROM search_pages WHERE item_id=?").get(kind)?.n,
        ).toBe(0);
        expect(
          await library.storePdfPages(kind, replacement.localAssetPath, ["new document"]),
        ).toBe(true);
      }
      await library.storeOcrText(kind, "old OCR", "test", original.localAssetPath);
      expect((await library.getItem(kind))?.ocrText).toBe("");
      await library.storeOcrText(kind, "new OCR", "test", replacement.localAssetPath);
      expect((await library.getItem(kind))?.ocrText).toBe("new OCR");
    }
  } finally {
    await library.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Smart Space predicates precede the 200-item lane cap for lexical, current and legacy vectors", async () => {
  const root = mkdtempSync(join(tmpdir(), "inkling-scope-cap-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  try {
    const insert = library.db.prepare(
      "INSERT INTO items(id,kind,title,body,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    );
    insert.run("zz-target", "note", "scopeword", "scopeword", '{"tags":["wanted"]}', 0, 0);
    for (let i = 0; i < 220; i++)
      insert.run(
        `noise-${String(i).padStart(3, "0")}`,
        "quote",
        "scopeword",
        "scopeword",
        '{"tags":["other"]}',
        i + 1,
        i + 1,
      );
    const vector = floatVectorBytes(unit());
    library.db.exec("BEGIN");
    for (const row of library.db.prepare("SELECT id FROM items ORDER BY id").all()) {
      library.db
        .prepare("INSERT INTO item_embeddings VALUES(?,?,?,?,?,?)")
        .run(row.id, "text", TEXT_MODEL, 768, vector, 0);
      library.db
        .prepare("INSERT INTO search_vectors VALUES(?,?,?,?,?,?,?)")
        .run(row.id, SEARCH_INDEX, "text", "chunk", 0, 768, vector);
    }
    library.db.exec("COMMIT");
    for (const query of [
      { text: "scopeword", tag: "wanted" },
      { text: "scopeword", kind: "note" },
      { text: "scopeword", kind: "note", tag: "wanted" },
    ]) {
      const space = await library.createSpace({ name: "Scoped", query });
      for (const vectors of [null, { current: unit() }, { legacy: unit() }])
        expect(
          (await library.listSpaceItems(space.id, 100, vectors)).map((item) => item.id),
        ).toEqual(["zz-target"]);
    }
  } finally {
    await library.close();
    rmSync(root, { recursive: true, force: true });
  }
});
