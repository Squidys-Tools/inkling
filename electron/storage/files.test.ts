import { afterAll, afterEach, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IMAGE_THUMBNAIL_JOB } from "./jobs.ts";
import { closeAll, count, removeTemporaryRoots, temporaryLibrary } from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);

test("file capture persists its item and asset before queued processing becomes visible", async () => {
  const { root, library } = await temporaryLibrary();
  const item = await library.saveFile({
    fileName: "quick note.txt",
    mimeType: "text/plain",
    kind: "other",
    bytes: new TextEncoder().encode("captured immediately"),
  });

  expect(item).toMatchObject({
    kind: "file",
    localAssetPath: `assets/items/${item.id}/quick note.txt`,
  });
  expect(readFileSync(join(root, "assets", "items", item.id, "quick note.txt"), "utf8")).toBe(
    "captured immediately",
  );
  expect(await library.jobs.getForItem(item.id)).toMatchObject([
    { kind: "generate_embedding", status: "pending" },
  ]);
  expect(await library.jobs.countActive()).toBe(1);
});

test("file bytes arrive as a typed array view or an ArrayBuffer, never a number array", async () => {
  const { root, library } = await temporaryLibrary();
  const text = new TextEncoder().encode("exact bytes");
  // A view into a larger buffer, as a pooled Buffer is: only its window is the file.
  const padded = new Uint8Array(text.length + 8);
  padded.set(text, 4);
  const saved = (name: string, bytes: unknown) =>
    library.saveFile({ fileName: name, mimeType: "text/plain", kind: "other", bytes });
  const read = (id: string, name: string) =>
    readFileSync(join(root, "assets", "items", id, name), "utf8");

  const view = await saved("view.txt", padded.subarray(4, 4 + text.length));
  const buffer = await saved("buffer.txt", text.buffer.slice(0));
  expect(read(view.id, "view.txt")).toBe("exact bytes");
  expect(read(buffer.id, "buffer.txt")).toBe("exact bytes");

  await expect(saved("array.txt", [...text])).rejects.toThrow(
    "must be a Uint8Array or ArrayBuffer",
  );
  await expect(saved("missing.txt", undefined)).rejects.toThrow("Uint8Array or ArrayBuffer");
  await expect(saved("empty.txt", new Uint8Array())).rejects.toThrow("cannot be empty");
});

test("image capture saves the item and header-read size without resizing", async () => {
  let resized = 0;
  const { root, library } = await temporaryLibrary({
    media: {
      inspectImage: async () => ({ width: 1200, height: 800 }),
      createThumbnail: async () => {
        resized += 1;
        return { bytes: Buffer.from("thumbnail"), width: 1200, height: 800 };
      },
    },
  });
  const item = await library.saveFile({
    fileName: "photo.png",
    mimeType: "image/png",
    bytes: new TextEncoder().encode("source image"),
  });

  expect(resized).toBe(0);
  expect(item).toMatchObject({
    kind: "image",
    thumbnailPath: null,
    metadata: { mediaWidth: 1200, mediaHeight: 800 },
  });
  expect(readdirSync(join(root, "assets", "items", item.id))).toEqual(["photo.png"]);
  expect(
    library.db
      .prepare("SELECT kind, status FROM jobs WHERE item_id = ? ORDER BY kind")
      .all(item.id),
  ).toEqual([
    { kind: "generate_embedding", status: "pending" },
    { kind: IMAGE_THUMBNAIL_JOB, status: "pending" },
    { kind: "ocr_image", status: "pending" },
  ]);
  expect((await library.jobs.getForItem(item.id)).map((job) => job.kind)).not.toContain(
    IMAGE_THUMBNAIL_JOB,
  );
});

test("image capture refuses what inspection rejects before it stores anything", async () => {
  const { root, library } = await temporaryLibrary({
    media: {
      inspectImage: async () => {
        throw new Error("image processing error: image dimensions exceed safe limits");
      },
    },
  });
  await expect(
    library.saveFile({
      fileName: "huge.png",
      kind: "image",
      bytes: new TextEncoder().encode("not really"),
    }),
  ).rejects.toThrow("safe limits");

  expect(count(library, "items")).toBe(0);
  expect(count(library, "jobs")).toBe(0);
  expect(existsSync(join(root, "assets", "items"))).toBe(false);
});
