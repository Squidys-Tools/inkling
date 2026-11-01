import { describe, expect, test } from "bun:test";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_VERSION } from "../../packages/library/src/storage/schema.ts";
import {
  seedBodies,
  seedItems,
  seedMembership,
  seedSpaces,
} from "../../apps/renderer/src/library/preview/seed-data.ts";
import { seedLibrary } from "./seeded-library.ts";

describe("seedLibrary", () => {
  test("writes the demo library once into an empty directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "inkling-seeded-library-"));
    try {
      expect(await seedLibrary(directory)).toBe(true);
      expect(await seedLibrary(directory)).toBe(false);
      const db = new DatabaseSync(join(directory, "library.sqlite3"), { readOnly: true });
      const archivedCopies = seedItems.filter((item) => item.archivedCopy).length;
      expect(db.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
      expect(db.prepare("SELECT COUNT(*) AS c FROM items").get()).toEqual({
        c: seedItems.length + archivedCopies,
      });
      expect(db.prepare("SELECT COUNT(*) AS c FROM items_fts").get()).toEqual({
        c: seedItems.length + archivedCopies,
      });
      expect(db.prepare("SELECT COUNT(*) AS c FROM spaces").get()).toEqual({
        c: seedSpaces.length,
      });
      expect(
        db
          .prepare("SELECT COUNT(*) AS c FROM space_items WHERE space_id = 'seed-weekend-reading'")
          .get(),
      ).toEqual({ c: seedMembership["seed-weekend-reading"].length });
      expect(
        db.prepare("SELECT value FROM app_settings WHERE key = 'onboarding_completed'").get(),
      ).toEqual({ value: "1" });
      expect(
        db.prepare("SELECT status, retry_count FROM jobs WHERE item_id = 'preview-file'").get(),
      ).toEqual({ status: "failed", retry_count: 3 });
      const note = db.prepare("SELECT body FROM items WHERE id = '12'").get();
      expect(note).toEqual({ body: seedBodies["12"] });
      const article = db
        .prepare("SELECT metadata FROM items WHERE id = 'preview-article-image'")
        .get() as { metadata: string };
      expect(JSON.parse(article.metadata).html).toContain("article-lede");
      db.close();
      for (const item of seedItems) {
        const fileName = item.file ?? item.thumbnailFile;
        if (fileName) await access(join(directory, "assets", "items", item.id, fileName));
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
