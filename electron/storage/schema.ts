import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 9;

// String.prototype.trim removes this whole set; SQLite's trim(x) strips spaces only.
export const jsTrimCharacters = `char(${[
  9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201,
  8202, 8232, 8233, 8239, 8287, 12288, 65279,
].join(",")})`;

const itemsSchema = `
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  title TEXT,
  description TEXT,
  body TEXT NOT NULL DEFAULT '',
  body_format TEXT NOT NULL DEFAULT 'md',
  source_url TEXT,
  source_label TEXT,
  local_asset_path TEXT,
  thumbnail_path TEXT,
  ocr_text TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  -- Pins have no UI for now. The column stays, and restore copies it, so pins
  -- saved before they were removed are still there if they come back.
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_items_active_updated ON items (archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_kind ON items (kind);
`;

// Article payloads (cleaned HTML and text) live here, not in items.metadata, so
// card reads never pay for them. A column holds a value only when it trims to
// non-empty; hasArticleContent is therefore a header-only IS NOT NULL check.
const itemContentSchema = `
CREATE TABLE IF NOT EXISTS item_content (
  item_id TEXT PRIMARY KEY NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  html TEXT,
  text TEXT,
  extracted_text TEXT
);
`;

const jobsSchema = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  worker_id TEXT,
  lease_until INTEGER,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER,
  progress_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_item ON jobs (item_id, created_at DESC);
`;

const embeddingsSchema = `
CREATE TABLE IF NOT EXISTS item_embeddings (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'image')),
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0),
  vector BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_item_embeddings_kind ON item_embeddings (kind, model);
`;

const spacesSchema = `
CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  query TEXT NOT NULL DEFAULT '{}',
  kind TEXT NOT NULL DEFAULT 'smart',
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spaces_position ON spaces (position, created_at);
CREATE TABLE IF NOT EXISTS space_items (
  space_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_space_items_item ON space_items (item_id);
`;

const appSettingsSchema = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

type Row = Record<string, unknown>;

function tableHasColumn(db: DatabaseSync, table: string, name: string) {
  return Boolean(
    db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name),
  );
}

function ensureColumns(db: DatabaseSync, table: string, columns: [string, string][]) {
  for (const [name, definition] of columns) {
    if (!tableHasColumn(db, table, name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function migrateItemColumns(db: DatabaseSync, migrationNeeded: boolean) {
  const addedBody = !tableHasColumn(db, "items", "body");
  const addedBodyFormat = !tableHasColumn(db, "items", "body_format");
  if (addedBody) db.exec("ALTER TABLE items ADD COLUMN body TEXT NOT NULL DEFAULT ''");
  if (addedBodyFormat) {
    db.exec("ALTER TABLE items ADD COLUMN body_format TEXT NOT NULL DEFAULT 'md'");
  }
  const needsBackfill =
    migrationNeeded ||
    addedBody ||
    addedBodyFormat ||
    Boolean(
      db.prepare("SELECT 1 FROM items WHERE body IS NULL OR body_format IS NULL LIMIT 1").get(),
    );
  if (!needsBackfill) return;
  const rows = db.prepare("SELECT id, kind, description, body, body_format FROM items").all() as {
    id: string;
    kind: string;
    description: string | null;
    body: string | null;
    body_format: string | null;
  }[];
  const update = db.prepare("UPDATE items SET body = ?, body_format = ? WHERE id = ?");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of rows) {
      const body = row.body?.trim() ? row.body : row.kind === "note" ? (row.description ?? "") : "";
      const bodyFormat = row.body_format?.trim() ? row.body_format : "md";
      update.run(body, bodyFormat, row.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Moves the heavy article keys out of items.metadata into item_content. One
// transaction, so an interrupted open retries it next launch; re-running finds
// no keys left and skips. Values are trimmed like the writers' nonEmpty check.
function migrateItemContent(db: DatabaseSync) {
  // returns true when it moved rows, so setupFts rebuilds an index built from the old keys
  const hasKeys = Boolean(
    db
      .prepare(`SELECT 1 FROM items WHERE json_valid(metadata) AND (
      json_type(metadata, '$.html') IS NOT NULL OR
      json_type(metadata, '$.text') IS NOT NULL OR
      json_type(metadata, '$.extractedText') IS NOT NULL) LIMIT 1`)
      .get(),
  );
  if (!hasKeys) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      INSERT OR REPLACE INTO item_content (item_id, html, text, extracted_text)
      SELECT id,
        CASE WHEN json_type(metadata, '$.html') = 'text'
          THEN nullif(trim(json_extract(metadata, '$.html'), ${jsTrimCharacters}), '') END,
        CASE WHEN json_type(metadata, '$.text') = 'text'
          THEN nullif(trim(json_extract(metadata, '$.text'), ${jsTrimCharacters}), '') END,
        CASE WHEN json_type(metadata, '$.extractedText') = 'text'
          THEN nullif(trim(json_extract(metadata, '$.extractedText'), ${jsTrimCharacters}), '') END
      FROM items
      WHERE json_valid(metadata) AND (
        json_type(metadata, '$.html') = 'text' OR
        json_type(metadata, '$.text') = 'text' OR
        json_type(metadata, '$.extractedText') = 'text');
      DELETE FROM item_content WHERE html IS NULL AND text IS NULL AND extracted_text IS NULL;
      UPDATE items SET metadata = json_remove(metadata, '$.html', '$.text', '$.extractedText')
      WHERE json_valid(metadata) AND (
        json_type(metadata, '$.html') IS NOT NULL OR
        json_type(metadata, '$.text') IS NOT NULL OR
        json_type(metadata, '$.extractedText') IS NOT NULL);
    `);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

// FTS rows are keyed by the item's rowid so a delete is one lookup; content
// columns come from item_content so article text stays searchable while the
// items row stays small. The items triggers fire only on indexed columns, so
// archive flips and thumbnail writes no longer rewrite FTS rows.
const ftsColumns = `item_id, title, description, source_label, ocr_text, metadata, body,
  content_text, content_html, content_extracted_text`;

function setupFts(db: DatabaseSync, rebuild: boolean) {
  try {
    db.exec("BEGIN IMMEDIATE");
    const exists = Boolean(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'items_fts'").get(),
    );
    const current =
      exists &&
      tableHasColumn(db, "items_fts", "body") &&
      tableHasColumn(db, "items_fts", "content_text");
    if (exists && !current) db.exec("DROP TABLE items_fts");
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        item_id UNINDEXED, title, description, source_label, ocr_text, metadata, body,
        content_text, content_html, content_extracted_text
      );
      DROP TRIGGER IF EXISTS items_fts_after_insert;
      CREATE TRIGGER items_fts_after_insert AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, ${ftsColumns})
        VALUES (new.rowid, new.id, new.title, new.description, new.source_label, new.ocr_text,
          new.metadata, new.body,
          (SELECT c.text FROM item_content c WHERE c.item_id = new.id),
          (SELECT c.html FROM item_content c WHERE c.item_id = new.id),
          (SELECT c.extracted_text FROM item_content c WHERE c.item_id = new.id));
      END;
      DROP TRIGGER IF EXISTS items_fts_after_delete;
      CREATE TRIGGER items_fts_after_delete AFTER DELETE ON items BEGIN
        DELETE FROM items_fts WHERE rowid = old.rowid;
      END;
      DROP TRIGGER IF EXISTS items_fts_after_update;
      CREATE TRIGGER items_fts_after_update AFTER UPDATE OF title, description, source_label,
        ocr_text, metadata, body ON items BEGIN
        DELETE FROM items_fts WHERE rowid = old.rowid;
        INSERT INTO items_fts(rowid, ${ftsColumns})
        VALUES (new.rowid, new.id, new.title, new.description, new.source_label, new.ocr_text,
          new.metadata, new.body,
          (SELECT c.text FROM item_content c WHERE c.item_id = new.id),
          (SELECT c.html FROM item_content c WHERE c.item_id = new.id),
          (SELECT c.extracted_text FROM item_content c WHERE c.item_id = new.id));
      END;
      DROP TRIGGER IF EXISTS item_content_fts_after_insert;
      CREATE TRIGGER item_content_fts_after_insert AFTER INSERT ON item_content BEGIN
        DELETE FROM items_fts
          WHERE rowid = (SELECT i.rowid FROM items i WHERE i.id = new.item_id);
        INSERT INTO items_fts(rowid, ${ftsColumns})
        SELECT i.rowid, i.id, i.title, i.description, i.source_label, i.ocr_text, i.metadata,
          i.body, new.text, new.html, new.extracted_text FROM items i WHERE i.id = new.item_id;
      END;
      DROP TRIGGER IF EXISTS item_content_fts_after_update;
      CREATE TRIGGER item_content_fts_after_update AFTER UPDATE ON item_content BEGIN
        DELETE FROM items_fts
          WHERE rowid = (SELECT i.rowid FROM items i WHERE i.id = new.item_id);
        INSERT INTO items_fts(rowid, ${ftsColumns})
        SELECT i.rowid, i.id, i.title, i.description, i.source_label, i.ocr_text, i.metadata,
          i.body, new.text, new.html, new.extracted_text FROM items i WHERE i.id = new.item_id;
      END;
      DROP TRIGGER IF EXISTS item_content_fts_after_delete;
      CREATE TRIGGER item_content_fts_after_delete AFTER DELETE ON item_content BEGIN
        DELETE FROM items_fts
          WHERE rowid = (SELECT i.rowid FROM items i WHERE i.id = old.item_id);
        INSERT INTO items_fts(rowid, ${ftsColumns})
        SELECT i.rowid, i.id, i.title, i.description, i.source_label, i.ocr_text, i.metadata,
          i.body, NULL, NULL, NULL FROM items i WHERE i.id = old.item_id;
      END;
    `);
    const itemCount = (db.prepare("SELECT COUNT(*) AS count FROM items").get() as Row).count;
    const indexedCount = (db.prepare("SELECT COUNT(*) AS count FROM items_fts").get() as Row).count;
    // The triggers address FTS rows by items.rowid; a VACUUM on the live file
    // could reassign rowids, so a mismatched pair means rebuild the index.
    const rowidDrifted =
      exists &&
      Boolean(
        db
          .prepare(
            `SELECT 1 FROM items_fts f WHERE NOT EXISTS (
               SELECT 1 FROM items i WHERE i.rowid = f.rowid AND i.id = f.item_id) LIMIT 1`,
          )
          .get(),
      );
    if (!exists || !current || rebuild || itemCount !== indexedCount || rowidDrifted) {
      db.exec(`
        DELETE FROM items_fts;
        INSERT INTO items_fts(rowid, ${ftsColumns})
        SELECT i.rowid, i.id, i.title, i.description, i.source_label, i.ocr_text, i.metadata,
          i.body, c.text, c.html, c.extracted_text
        FROM items i LEFT JOIN item_content c ON c.item_id = i.id;
      `);
    }
    db.exec("COMMIT");
    return true;
  } catch {
    if (db.isTransaction) db.exec("ROLLBACK");
    return false;
  }
}

export function openDatabase(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  if (version < 1) db.exec(itemsSchema);
  else if (version === 1) {
    try {
      db.exec("ALTER TABLE items ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''");
    } catch {}
    db.exec(`
      DROP TRIGGER IF EXISTS items_fts_after_insert;
      DROP TRIGGER IF EXISTS items_fts_after_update;
      DROP TRIGGER IF EXISTS items_fts_after_delete;
      DROP TABLE IF EXISTS items_fts;
    `);
  } else if (version === 2) {
    try {
      db.exec("ALTER TABLE jobs ADD COLUMN worker_id TEXT");
    } catch {}
    try {
      db.exec("ALTER TABLE jobs ADD COLUMN lease_until INTEGER");
    } catch {}
  }
  db.exec(jobsSchema);
  ensureColumns(db, "jobs", [
    ["worker_id", "TEXT"],
    ["lease_until", "INTEGER"],
    ["progress_current", "INTEGER NOT NULL DEFAULT 0"],
    ["progress_total", "INTEGER"],
    ["progress_message", "TEXT"],
  ]);
  // The FTS triggers rewrite the whole FTS row per statement, so they are
  // parked while migrations rewrite items; setupFts recreates them after.
  db.exec(`
    DROP TRIGGER IF EXISTS items_fts_after_insert;
    DROP TRIGGER IF EXISTS items_fts_after_update;
    DROP TRIGGER IF EXISTS items_fts_after_delete;
    DROP TRIGGER IF EXISTS item_content_fts_after_insert;
    DROP TRIGGER IF EXISTS item_content_fts_after_update;
    DROP TRIGGER IF EXISTS item_content_fts_after_delete;
  `);
  migrateItemColumns(db, version < SCHEMA_VERSION);
  db.exec(itemContentSchema);
  // A failed move leaves v8-shaped rows that every read path still handles; the
  // keys are still present, so the next open retries the migration.
  let moved = false;
  try {
    moved = migrateItemContent(db);
  } catch (error) {
    console.warn("item content migration failed; will retry on next open", error);
  }
  db.exec(embeddingsSchema);
  db.exec(spacesSchema);
  db.exec(appSettingsSchema);
  ensureColumns(db, "spaces", [["kind", "TEXT NOT NULL DEFAULT 'smart'"]]);
  const fts5Enabled = setupFts(db, moved);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { db, fts5Enabled };
}
