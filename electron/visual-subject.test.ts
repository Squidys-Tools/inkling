import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyImage, matchesVisualSubject, visualSubjectQuery } from "./visual-subject.ts";
import { openTestLibrary } from "./storage/test-library.ts";
import { seedSearchFile } from "./search-fixtures.ts";

const photo = { title: "neutral.png", caption: "A cat sitting by a window.", ocrText: "" };
test("visual intent is a noun list, not an OCR/document instruction or a breed expansion", () => {
  expect(visualSubjectQuery("pictures of cats and dogs")).toEqual(["cat", "dog"]);
  expect(visualSubjectQuery("corgi")).toEqual(["corgi"]);
  for (const text of ["Discord", "cat training notes", "screenshot of a cat", "category", ""])
    expect(visualSubjectQuery(text)).toBeNull();
  expect(matchesVisualSubject(photo, ["cat"])).toBe(true);
  expect(matchesVisualSubject({ ...photo, caption: "A dog in a park." }, ["cat"])).toBe(false);
  expect(
    matchesVisualSubject({ ...photo, caption: "There is no cat in the scene." }, ["cat"]),
  ).toBe(false);
  expect(
    matchesVisualSubject({ ...photo, caption: "A dog in a park.", tags: ["corgi"] }, ["corgi"]),
  ).toBe(true);
  expect(
    matchesVisualSubject({ ...photo, caption: "A car in a park.", tags: ["cat"] }, ["cat"]),
  ).toBe(false);
});
test("UI shots and self-captures are not photographs even when their captions mention animals", () => {
  for (const evidence of [
    { ...photo, caption: "A screenshot with three cats and a dog." },
    { ...photo, caption: "A screen shot of cats on a computer screen." },
    { ...photo, caption: "A black screen has icons and a cat on it." },
    { ...photo, ocrText: "Search your mind" },
    { ...photo, ocrText: "a@ bearch your mind" },
  ]) {
    expect(classifyImage(evidence)).not.toBe("photo");
    expect(matchesVisualSubject(evidence, ["cat", "dog"])).toBe(false);
  }
  // Capturing a real photo is not the same thing as an app-gallery screenshot.
  expect(matchesVisualSubject({ ...photo, title: "Screenshot From yesterday.png" }, ["cat"])).toBe(
    true,
  );
  expect(classifyImage({ ...photo, caption: null })).toBe("unknown");
});

for (const useFts5 of [true, false]) {
  test(`subject evidence rejects printed and negated words without losing breeds or physical buttons; FTS=${useFts5}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "inkling-subject-edges-"));
    const lib = await openTestLibrary(join(root, "library.sqlite3"), { useFts5 });
    const ids = async (query: string) => (await lib.searchItems(query)).map((x) => x.id).sort();
    try {
      for (const [id, caption] of [
        ["corgis", "Two corgis playing in a garden."],
        ["dog", "A dog sitting on grass."],
        ["poodle", "A poodle sitting on grass."],
        ["buttons", "A cat standing next to a coat with silver buttons."],
        ["no-cat", "There is no visible cat in the scene."],
        ["no-cats", "There are no small striped cats or dogs in the scene."],
        ["word", "A white shirt with the word cat printed on it."],
        ["quote", 'A white shirt with the word "cat" printed on it.'],
        ["print", "A cat printed on a white shirt."],
        ["actual-cat", "A cat wearing a shirt with a dog printed on it."],
      ]) {
        const item = await seedSearchFile(lib, root, {
          id,
          fileName: "neutral.png",
          kind: "image",
          bytes: new Uint8Array([1]),
        });
        await lib.storeSearchAnnotation(id, item.localAssetPath!, caption, []);
      }
      expect(visualSubjectQuery("poodle")).toEqual(["poodle"]);
      expect(visualSubjectQuery("poodles")).toEqual(["poodle"]);
      expect(await ids("poodle")).toEqual(["poodle"]);
      expect(await ids("corgis")).toEqual(["corgis"]);
      expect(await ids("dog")).toEqual(["corgis", "dog", "poodle"]);
      expect(await ids("cat")).toEqual(["actual-cat", "buttons"]);
      const combined = await lib.createSpace({ name: "Cat Dog", query: {} });
      expect((await lib.listSpaceItems(combined.id)).map((x) => x.id).sort()).toEqual([
        "actual-cat",
        "buttons",
        "corgis",
        "dog",
        "poodle",
      ]);
    } finally {
      await lib.close();
      await rm(root, { recursive: true, force: true });
    }
  });
  test(`Smart subject Spaces fence every retrieval lane; FTS=${useFts5}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "inkling-subject-space-"));
    const lib = await openTestLibrary(join(root, "library.sqlite3"), { useFts5 });
    const vector = new Float32Array(768);
    vector[0] = 1;
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
    try {
      for (const [id, caption, ocr] of [
        ["real-cat", "A tabby cat sitting on a ledge.", ""],
        ["real-dog", "A fluffy white dog on grass.", ""],
        [
          "gallery",
          "A screen shot of cats and dogs on a computer screen.",
          "Search your mind cat dog",
        ],
        ["chat", "A black screen has white words and icons.", "cat dog Discord message"],
        ["car", "A red car on the road.", "cat dog"],
      ]) {
        const item = await seedSearchFile(lib, root, {
          id,
          fileName: id === "car" ? "cat dog.png" : "neutral.png",
          kind: "image",
          bytes: new Uint8Array([1]),
        });
        await lib.storeOcrText(id, ocr, "fixture");
        await lib.storeSearchAnnotation(id, item.localAssetPath!, caption, []);
        const input = (await lib.searchInput(id))!;
        await lib.storeSearchIndex(id, input.revision, input.chunks, [
          { kind: "image", chunkId: "image:fixture", vector },
          { kind: "text", chunkId: "ocr:fixture", vector },
        ]);
      }
      const note = await lib.createNote({ title: "cat dog training notes", body: "cat dog" });
      const space = await lib.createSpace({ name: "Cat Dog", kind: "smart", query: {} });
      const notes = await lib.createSpace({
        name: "Notes",
        query: { text: "cat dog training notes" },
      });
      expect(ids(await lib.listSpaceItems(notes.id))).toEqual([note.id]);
      const explicitNotes = await lib.createSpace({
        name: "Pet notes",
        query: { text: "cat dog", kind: "note" },
      });
      expect(ids(await lib.listSpaceItems(explicitNotes.id))).toEqual([note.id]);
      // Effective intent must not mutate the saved/exported empty legacy query.
      expect((await lib.getSpace(space.id))?.query).toEqual({});
      for (const vectors of [null, { current: vector }, { legacy: vector }]) {
        expect(ids(await lib.listSpaceItems(space.id, 100, vectors))).toEqual([
          "real-cat",
          "real-dog",
        ]);
        expect(ids(await lib.searchItems("cat", 100, vectors))).toEqual(
          ["real-cat", note.id].sort(),
        );
        expect(ids(await lib.searchItems("dogs", 100, vectors))).toEqual(["real-dog"]);
      }
      // Rejected screenshots can't fill the cap ahead of a true picture.
      expect((await lib.listSpaceItems(space.id, 1, { current: vector })).length).toBe(1);
      await lib.removeSpaceItem(space.id, "real-cat");
      expect(ids(await lib.listSpaceItems(space.id))).toEqual(["real-dog"]);
      expect(ids(await lib.searchItems("Discord"))).toEqual(["chat"]);
      const regular = await lib.createSpace({ name: "Cat Dog", kind: "regular" });
      await lib.addSpaceItem(regular.id, "chat");
      expect(ids(await lib.listSpaceItems(regular.id))).toEqual(["chat"]);
      const allImages = await lib.createSpace({ name: "Only images", query: { kind: "image" } });
      expect((await lib.listSpaceItems(allImages.id)).length).toBe(5);
      await lib.archiveItem("real-dog");
      expect(await lib.listSpaceItems(space.id)).toEqual([]);
      // Same-name replacement must not reuse a prior caption as visual evidence.
      await seedSearchFile(lib, root, {
        id: "real-cat",
        fileName: "neutral.png",
        kind: "image",
        bytes: new Uint8Array([2]),
      });
      expect(ids(await lib.searchItems("cat"))).not.toContain("real-cat");
    } finally {
      await lib.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
