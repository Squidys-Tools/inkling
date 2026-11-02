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
