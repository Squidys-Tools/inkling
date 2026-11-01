import { existsSync } from "node:fs";
import { copyFile, link, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "../../packages/library/src/storage/schema.ts";
import {
  seedArticles,
  seedBodies,
  seedItems,
  seedMembership,
  seedSpaces,
  type SeedItem,
} from "../../apps/renderer/src/library/preview/seed-data.ts";

const seedAssets = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/renderer/src/library/preview/seed-demo",
);
const day = 24 * 60 * 60 * 1000;

// A hard link costs no disk, so seventy worktrees seed seventy copies for free.
const place = async (source: string, target: string) => {
  try {
    await link(source, target);
  } catch {
    await copyFile(source, target);
  }
};

/**
 * Writes the web preview's demo library into a directory with no database yet,
 * so `bun run dev` and `bun run dev:app` show the same data. Returns false when
 * a library already exists there; reseeding is deleting the directory.
 */
export async function seedLibrary(directory: string) {
  const databasePath = join(directory, "library.sqlite3");
  if (existsSync(databasePath)) return false;
  await mkdir(join(directory, "assets", "items"), { recursive: true });
  const { db } = openDatabase(databasePath);
  const base = Date.now() - 30 * 60 * 1000;
  const items: (SeedItem & { archived?: boolean })[] = [
    ...seedItems,
    ...seedItems
      .filter((item) => item.archivedCopy)
      .map((item) => ({ ...item, id: `archive-${item.id}`, archived: true })),
  ];
  const insert = db.prepare(`INSERT INTO items (id, kind, title, description, body, body_format,
    source_url, source_label, local_asset_path, thumbnail_path, ocr_text, metadata,
    created_at, updated_at, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`);
  const fileWrites: Promise<unknown>[] = [];
  db.exec("BEGIN");
  try {
    for (const item of items) {
      const createdAt = base - Math.floor(item.index / 2) * day;
      const fileName = item.file ?? item.thumbnailFile;
      const asset = item.file ? `assets/items/${item.id}/${item.file}` : null;
      const thumbnail =
        item.kind === "image" && item.file
          ? `assets/items/${item.id}/${item.file}`
          : item.thumbnailFile
            ? `assets/items/${item.id}/${item.thumbnailFile}`
            : null;
      const metadata = { ...item.metadata };
      const html = seedArticles[item.id];
      if (html) metadata.html = html;
      insert.run(
        item.id,
        item.kind,
        item.title,
        item.description ?? null,
        seedBodies[item.id] ?? "",
        "md",
        item.sourceUrl ?? null,
        item.source ?? null,
        asset,
        thumbnail,
        JSON.stringify(metadata),
        createdAt,
        createdAt,
        item.archived ? 1 : 0,
      );
      if (fileName) {
        const itemDirectory = join(directory, "assets", "items", item.id);
        fileWrites.push(
          mkdir(itemDirectory, { recursive: true }).then(() =>
            place(join(seedAssets, fileName), join(itemDirectory, fileName)),
          ),
        );
      }
    }
    const insertSpace = db.prepare(`INSERT INTO spaces (id, name, color, query, kind, position,
      created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const space of seedSpaces)
      insertSpace.run(
        space.id,
        space.name,
        space.color,
        JSON.stringify(space.query),
        space.kind,
        space.position,
        base,
        base,
      );
    const insertMember = db.prepare(
      "INSERT INTO space_items (space_id, item_id, added_at) VALUES (?, ?, ?)",
    );
    for (const [spaceId, ids] of Object.entries(seedMembership))
      for (const itemId of ids) insertMember.run(spaceId, itemId, base);
    // One permanently failed job, so the card's failed state shows like the preview's.
    db.prepare(`INSERT INTO jobs (id, item_id, kind, status, retry_count, max_retries,
      error_message, created_at, started_at, completed_at, progress_current)
      VALUES ('seed-job-failed', 'preview-file', 'thumbnail', 'failed', 3, 3,
      'The file could not be read.', ?, ?, ?, 0)`).run(base, base, base);
    db.prepare(
      "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('onboarding_completed', '1')",
    ).run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
  await Promise.all(fileWrites);
  return true;
}
