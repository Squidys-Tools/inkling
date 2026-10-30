import { expect, test } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestLibrary } from "./storage/test-library.ts";

test("screenshot content identity commits with random-ID items and survives archive, reopen and restore", async () => {
  const root = await mkdtemp(join(tmpdir(), "inkling-screenshot-storage-"));
  let library = await openTestLibrary(join(root, "library.sqlite3"));
  const input = { fileName: "one.png", bytes: Buffer.from("same screenshot bytes") };
  try {
    expect(await library.saveScreenshot(input)).toBe(true);
    const [item] = await library.listActiveItems();
    expect(item.id).not.toStartWith("screenshot-");
    expect(await library.saveScreenshot({ ...input, fileName: "renamed.png" })).toBe(false);
    await library.archiveItem(item.id);
    await library.close();
    library = await openTestLibrary(join(root, "library.sqlite3"));
    expect(await library.saveScreenshot(input)).toBe(false);
    expect((await library.getItem(item.id))?.archived).toBe(true);
    const exports = join(root, "exports");
    await mkdir(exports);
    const report = await library.exportLibrary(exports, 0);
    const restored = await openTestLibrary(join(root, "restored", "library.sqlite3"));
    try {
      await restored.importLibrary(report.directory);
      expect(await restored.saveScreenshot(input)).toBe(false);
      expect((await restored.listArchivedItems()).map((row) => row.id)).toEqual([item.id]);
    } finally {
      await restored.close();
    }
  } finally {
    await library.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("screenshot retries after a failed item/job transaction do not leave a false delivery checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "inkling-screenshot-rollback-"));
  const library = await openTestLibrary(join(root, "library.sqlite3"));
  const input = { fileName: "retry.png", bytes: Buffer.from("retry screenshot") };
  try {
    library.db.exec(
      "CREATE TRIGGER reject_job BEFORE INSERT ON jobs BEGIN SELECT RAISE(ABORT, 'held job queue'); END",
    );
    await expect(library.saveScreenshot(input)).rejects.toThrow();
    expect(await library.listActiveItems()).toEqual([]);
    library.db.exec("DROP TRIGGER reject_job");
    expect(await library.saveScreenshot(input)).toBe(true);
    expect(await library.saveScreenshot(input)).toBe(false);
    expect(await library.listActiveItems()).toHaveLength(1);
  } finally {
    await library.close();
    await rm(root, { recursive: true, force: true });
  }
});
