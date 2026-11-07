import { afterAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createItemTransfer } from "./item-transfer.ts";
import { createQuitDrain } from "./quit-drain.ts";

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "quit retries real export cleanup after a repaired permissions failure",
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), "inkling-quit-retry-"));
    const sharing = createItemTransfer({
      assetsDirectory: scratch,
      temporaryDirectory: scratch,
      item: async () => ({
        kind: "note",
        title: "private",
        body: "secret",
        bodyFormat: "md",
        sourceUrl: null,
        localAssetPath: null,
      }),
    });
    const exported = await sharing.file("note");
    const folder = exported.slice(0, exported.lastIndexOf("/"));
    const failed = Promise.withResolvers<void>();
    const quit = Promise.withResolvers<void>();
    let quits = 0;
    const hook = createQuitDrain(
      () => sharing.close(),
      () => {
        quits++;
        quit.resolve();
      },
      () => failed.resolve(),
    );
    try {
      await chmod(folder, 0o500);
      hook({ preventDefault() {} });
      await failed.promise;
      expect(quits).toBe(0);
      await expect(sharing.file("later")).rejects.toThrow("closed");
      await chmod(folder, 0o700);
      hook({ preventDefault() {} });
      await quit.promise;
      expect(quits).toBe(1);
      expect(await readdir(scratch)).toEqual([]);
      await sharing.close();
      hook({
        preventDefault() {
          throw new Error("already drained");
        },
      });
    } finally {
      await chmod(folder, 0o700).catch(() => {});
      await sharing.close();
      await rm(scratch, { recursive: true, force: true });
    }
  },
);

const root = await mkdtemp(join(tmpdir(), "inkling-transfer-test-"));
const assets = join(root, "assets");
await mkdir(assets);
const original = await sharp({ create: { width: 3, height: 2, channels: 3, background: "red" } })
  .jpeg()
  .toBuffer();
await writeFile(join(assets, "photo.jpg"), original);
await writeFile(join(root, "outside.txt"), "private");
await symlink(join(root, "outside.txt"), join(assets, "escape.txt"));
const transfer = createItemTransfer({
  assetsDirectory: assets,
  temporaryDirectory: root,
  item: async (id) => {
    const base = {
      kind: "image",
      title: "../unsafe/name",
      body: "",
      bodyFormat: "md",
      sourceUrl: null,
      localAssetPath: "assets/photo.jpg",
    };
    if (id === "missing") return null;
    if (id === "note") return { ...base, kind: "note", body: "# My note", localAssetPath: null };
    if (id === "escape") return { ...base, localAssetPath: "assets/escape.txt" };
    if (id === "large") return { ...base, localAssetPath: "assets/large.jpg" };
    if (id === "wide") return { ...base, localAssetPath: "assets/wide.png" };
    if (id === "huge") return { ...base, localAssetPath: "assets/huge.jpg" };
    return base;
  },
});
afterAll(async () => {
  await transfer.close();
  await rm(root, { recursive: true, force: true });
});

test("closing fences a delayed export and drains it before removing plaintext", async () => {
  const gate =
    Promise.withResolvers<Awaited<ReturnType<Parameters<typeof createItemTransfer>[0]["item"]>>>();
  const isolated = createItemTransfer({
    assetsDirectory: assets,
    temporaryDirectory: root,
    item: () => gate.promise,
  });
  const exporting = isolated.file("delayed");
  const rejected = exporting.then(
    () => null,
    (error: Error) => error,
  );
  let finished = false;
  const closing = isolated.close().then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  gate.resolve({
    kind: "note",
    title: "secret",
    body: "private",
    bodyFormat: "md",
    sourceUrl: null,
    localAssetPath: null,
  });
  expect((await rejected)?.message).toContain("closed");
  await closing;
  await expect(isolated.file("later")).rejects.toThrow("closed");
  expect((await readdir(root)).some((name) => name.startsWith("inkling-drag-"))).toBe(false);
});

test("copy decodes a saved original to PNG without modifying it", async () => {
  const { png, scaled } = await transfer.image("photo");
  expect(scaled).toBe(false);
  expect(await sharp(png).metadata()).toMatchObject({ format: "png", width: 3, height: 2 });
  expect(await readFile(join(assets, "photo.jpg"))).toEqual(original);
  expect(await transfer.file("photo")).toBe(await realpath(join(assets, "photo.jpg")));
});

test("missing, non-image, escaped and oversized copy inputs fail closed", async () => {
  await writeFile(join(assets, "large.jpg"), "x");
  await truncate(join(assets, "large.jpg"), 51 * 1024 * 1024);
  for (const id of ["", "missing", "note", "escape", "large"])
    await expect(transfer.image(id)).rejects.toBeInstanceOf(Error);
  await expect(transfer.file("escape")).rejects.toBeInstanceOf(Error);
  await sharp({ create: { width: 7000, height: 6000, channels: 3, background: "red" } })
    .png()
    .toFile(join(assets, "wide.png"));
  const wide = await transfer.image("wide");
  expect(wide.scaled).toBe(true);
  const { width = 0, height = 0 } = await sharp(wide.png).metadata();
  expect(width * height).toBeLessThanOrEqual(40_000_000);
  expect(width * height).toBeGreaterThan(39_000_000);
  // Only the header is read: a real 525 MP encode would take the whole test budget.
  const tooLarge = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const frame = tooLarge.indexOf(Buffer.from([0xff, 0xc0]));
  tooLarge.writeUInt16BE(21_000, frame + 5);
  tooLarge.writeUInt16BE(25_000, frame + 7);
  await writeFile(join(assets, "huge.jpg"), tooLarge);
  await expect(transfer.image("huge")).rejects.toThrow("too large to copy");
  // A GIF is decoded whole, so it stops at 100 MP as its jobs do, well short of 500 MP.
  const wholeDecode = await sharp({
    create: { width: 16, height: 16, channels: 3, background: "red" },
  })
    .gif()
    .toBuffer();
  const descriptor = wholeDecode.indexOf(Buffer.from([0x2c, 0, 0, 0, 0, 16, 0, 16, 0]));
  for (const at of [6, descriptor + 5]) {
    wholeDecode.writeUInt16LE(12_000, at);
    wholeDecode.writeUInt16LE(10_000, at + 2);
  }
  await writeFile(join(assets, "huge.jpg"), wholeDecode);
  await expect(transfer.image("huge")).rejects.toThrow("too large to copy");
});

test("text drag exports are sanitized, bounded, unique beyond capacity and cleaned up", async () => {
  let last = "";
  for (let index = 0; index < 40; index++) last = await transfer.file("note");
  expect(last).toEndWith("39-.._unsafe_name.md");
  expect(await readFile(last, "utf8")).toBe("# My note");
  const directory = (await readdir(root)).find((name) => name.startsWith("inkling-drag-"))!;
  expect(await readdir(join(root, directory))).toHaveLength(32);
  await transfer.close();
  expect((await readdir(root)).includes(directory)).toBe(false);
});
