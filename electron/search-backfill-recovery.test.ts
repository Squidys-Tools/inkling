import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestLibrary } from "./storage/test-library.ts";

for (const kind of ["generate_embedding", "caption_image"] as const) {
  test(`${kind} current failures stay bounded/manual but edits and later success are not fenced by old history`, async () => {
    const root = mkdtempSync(join(tmpdir(), "inkling-backfill-recovery-"));
    const library = await openTestLibrary(join(root, "library.sqlite3"));
    try {
      library.db.exec(
        "INSERT INTO items(id,kind,created_at,updated_at) VALUES('item','image',100,100)",
      );
      const candidate = () =>
        kind === "caption_image" ? library.nextCaptionCandidate() : library.nextSearchCandidate();
      const failed = await library.jobs.enqueue("item", kind);
      library.db
        .prepare("UPDATE jobs SET status='failed',created_at=200,completed_at=250 WHERE id=?")
        .run(failed);
      expect(await candidate()).toBeUndefined();
      expect(await candidate()).toBeUndefined(); // no automatic corrupt-input retry loop
      expect(await library.jobs.retry(failed)).toBe(true);
      expect(await candidate()).toBeUndefined(); // pending work is never duplicated
      library.db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(failed);
      expect(await candidate()).toMatchObject({ id: "item" });
      library.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(failed);
      library.db.exec("UPDATE items SET updated_at=300 WHERE id='item'");
      expect(await candidate()).toMatchObject({ id: "item" });
      const later = await library.jobs.enqueue("item", kind);
      expect(await candidate()).toBeUndefined();
      library.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(later);
      expect(await candidate()).toBeUndefined();
      library.db.prepare("UPDATE jobs SET status='completed' WHERE id=?").run(later);
      expect(await candidate()).toMatchObject({ id: "item" });
    } finally {
      await library.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
