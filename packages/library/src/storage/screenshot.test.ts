import { afterAll, afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  closeAll,
  closeLibrary,
  count,
  removeTemporaryRoots,
  temporaryLibrary,
  trackedLibrary,
} from "./test-helpers.ts";

afterEach(closeAll);
afterAll(removeTemporaryRoots);
const input = { fileName: "screen.png", bytes: Buffer.from("same screenshot pixels") };

test("screenshot content identity is committed with the random-ID item and survives archive/reopen", async () => {
  const { root, library } = await temporaryLibrary();
  expect(await library.saveScreenshot(input)).toBe(true);
  expect(await library.saveScreenshot({ ...input, fileName: "renamed.png" })).toBe(false);
  const [saved] = await library.listActiveItems();
  expect(saved.id).not.toStartWith("screenshot-");
  expect((await library.getItem(saved.id))?.metadata.screenshotHash).toBe(
    createHash("sha256").update(input.bytes).digest("hex"),
  );
  expect(count(library, "items")).toBe(1);
  await library.archiveItem(saved.id, true);
  await closeLibrary(library);
  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  expect(await reopened.saveScreenshot(input)).toBe(false);
  expect((await reopened.getItem(saved.id))?.archived).toBe(true);
  expect(await reopened.listActiveItems()).toEqual([]);
  expect(count(reopened, "items")).toBe(1);
});

test("screenshot storage returns the exact changed ID internally and indexes content lookup", async () => {
  const { library } = await temporaryLibrary();
  const id = await library.saveScreenshotItem(input);
  expect(typeof id).toBe("string");
  if (id === null) throw new Error("Expected a newly saved screenshot ID");
  expect((await library.listActiveItems()).map((item) => item.id)).toEqual([id]);
  expect(await library.saveScreenshotItem(input)).toBeNull();
  const plan = library.db
    .prepare(`EXPLAIN QUERY PLAN SELECT id FROM items
    WHERE id = ? OR CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.screenshotHash') END = ? LIMIT 1`)
    .all("screenshot-hash", "hash");
  expect(plan.map((row) => row.detail).join(" ")).toContain("idx_items_screenshot_hash");
});

test("a rejected screenshot is neither checkpointed nor stored", async () => {
  const { root, library } = await temporaryLibrary({
    media: {
      inspectImage: async () => {
        throw new Error("invalid image header");
      },
    },
  });
  await expect(library.saveScreenshot(input)).rejects.toThrow("invalid image header");
  expect(count(library, "items")).toBe(0);
  expect(count(library, "jobs")).toBe(0);
  expect(existsSync(join(root, "assets", "items"))).toBe(false);
});

test("legacy deterministic captures are never duplicated or resurrected", async () => {
  const { library } = await temporaryLibrary();
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  library.db
    .prepare(`INSERT INTO items (id,kind,title,created_at,updated_at,archived)
    VALUES (?, 'image', 'old screenshot', 1, 1, 1)`)
    .run(`screenshot-${hash}`);
  expect(await library.saveScreenshot(input)).toBe(false);
  expect(count(library, "items")).toBe(1);
  expect(await library.listActiveItems()).toEqual([]);
});

test("imported screenshots are titled by their moment, keeping the file name searchable", async () => {
  const { library } = await temporaryLibrary();
  const fileName = "Screenshot_2026-11-15-11-48-27-05_eb2ba5d78cfea8663119baf123060d17.jpg";
  expect(await library.saveScreenshot({ ...input, fileName })).toBe(true);
  const [saved] = await library.listActiveItems();
  expect(saved.title).toBe("Screenshot - 2026-11-15 11.48.27.jpg");
  expect(saved.sourceLabel).toBe("Screenshots");
  expect((await library.getItem(saved.id))?.metadata.fileName).toBe(fileName);
});

test("reopening retitles legacy imports once and never touches a title the user chose", async () => {
  const { root, library } = await temporaryLibrary();
  const legacy = (id: string, title: string, fileName: string, hash: string | null) =>
    library.db
      .prepare(`INSERT INTO items (id,kind,title,metadata,created_at,updated_at)
      VALUES (?, 'image', ?, ?, 1, 1)`)
      .run(id, title, JSON.stringify({ fileName, ...(hash ? { screenshotHash: hash } : {}) }));
  legacy("old", "Screenshot 2026-11-15 114827.png", "Screenshot 2026-11-15 114827.png", "a");
  legacy("mine", "My cat", "Screenshot 2026-11-15 114827.png", "b");
  legacy("dropped", "Screenshot 2026-11-15 114827.png", "Screenshot 2026-11-15 114827.png", null);
  library.db
    .prepare(`INSERT INTO items (id,kind,title,metadata,created_at,updated_at)
    VALUES ('broken', 'image', 'broken', '{not json', 1, 1)`)
    .run();
  await closeLibrary(library);
  const reopened = await trackedLibrary(join(root, "library.sqlite3"));
  const titles = async () =>
    Object.fromEntries(
      (await reopened.listActiveItems()).map((item) => [item.id, [item.title, item.sourceLabel]]),
    );
  expect(await titles()).toEqual({
    old: ["Screenshot - 2026-11-15 11.48.27.png", "Screenshots"],
    mine: ["My cat", "Screenshots"],
    dropped: ["Screenshot 2026-11-15 114827.png", null],
    broken: ["broken", null],
  });
  const found = await reopened.searchItems("screenshot 11.48.27", 20);
  expect(found.map((item) => item.id)).toContain("old");
});
