import { DatabaseSync } from "node:sqlite";
import { storageFailure } from "./errors.ts";

export const SCHEMA_VERSION = 11;

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
CREATE TABLE IF NOT EXISTS space_exclusions (
  space_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  excluded_at INTEGER NOT NULL,
  PRIMARY KEY (space_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_space_exclusions_item ON space_exclusions (item_id);
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

// The metadata words search matches: what the user wrote or saved, never JSON keys, HTML tags or
// bookkeeping. metadata.html is the markup of metadata.text. Unparseable legacy metadata is
// indexed as it is, because a JSON error here would fail the write that fired the trigger.
export const searchableMetadata = (column: string) => `CASE WHEN json_valid(${column}) THEN (
  SELECT group_concat(atom, ' ') FROM json_tree(${column}) WHERE atom IS NOT NULL AND (
    fullkey IN ('$.text', '$.quoteText', '$.attribution', '$.author', '$.publishedDate', '$.fileName',
      '$.sourceUrl', '$.social.authorName', '$.social.authorHandle', '$.social.text') OR path = '$.tags'
    OR (fullkey = '$.extractedText' AND atom IS NOT json_extract(${column}, '$.text')))
) ELSE ${column} END`;

function dropFts(db: DatabaseSync) {
  db.exec(`
    DROP TRIGGER IF EXISTS items_fts_after_insert;
    DROP TRIGGER IF EXISTS items_fts_after_update;
    DROP TRIGGER IF EXISTS items_fts_after_delete;
    DROP TABLE IF EXISTS items_fts;
  `);
}

function setupFts(db: DatabaseSync) {
  try {
    db.exec("BEGIN IMMEDIATE");
    const exists = Boolean(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'items_fts'").get(),
    );
    // An index row shares its item's rowid: item_id is UNINDEXED, so finding a row by it reads
    // every item's text. items has no INTEGER PRIMARY KEY, so a plain VACUUM of the live library
    // could renumber its rowids and would have to rebuild this index.
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        item_id UNINDEXED, title, description, source_label, ocr_text, metadata, body
      );
      DROP TRIGGER IF EXISTS items_fts_after_insert;
      CREATE TRIGGER items_fts_after_insert AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(rowid, item_id, title, description, source_label, ocr_text, metadata, body)
        VALUES (new.rowid, new.id, new.title, new.description, new.source_label, new.ocr_text, ${searchableMetadata("new.metadata")}, new.body);
      END;
      DROP TRIGGER IF EXISTS items_fts_after_delete;
      CREATE TRIGGER items_fts_after_delete AFTER DELETE ON items BEGIN
        DELETE FROM items_fts WHERE rowid = old.rowid;
      END;
      DROP TRIGGER IF EXISTS items_fts_after_update;
      CREATE TRIGGER items_fts_after_update
      AFTER UPDATE OF title, description, source_label, ocr_text, metadata, body ON items
      WHEN old.title IS NOT new.title OR old.description IS NOT new.description
        OR old.source_label IS NOT new.source_label OR old.ocr_text IS NOT new.ocr_text
        OR old.body IS NOT new.body
        OR ${searchableMetadata("old.metadata")} IS NOT ${searchableMetadata("new.metadata")}
      BEGIN
        DELETE FROM items_fts WHERE rowid = old.rowid;
        INSERT INTO items_fts(rowid, item_id, title, description, source_label, ocr_text, metadata, body)
        VALUES (new.rowid, new.id, new.title, new.description, new.source_label, new.ocr_text, ${searchableMetadata("new.metadata")}, new.body);
      END;
    `);
    const itemCount = (db.prepare("SELECT COUNT(*) AS count FROM items").get() as Row).count;
    const indexedCount = (db.prepare("SELECT COUNT(*) AS count FROM items_fts").get() as Row).count;
    if (!exists || itemCount !== indexedCount) {
      db.exec(`
        DELETE FROM items_fts;
        INSERT INTO items_fts(rowid, item_id, title, description, source_label, ocr_text, metadata, body)
        SELECT rowid, id, title, description, source_label, ocr_text, ${searchableMetadata("metadata")}, body FROM items;
      `);
    }
    db.exec("COMMIT");
    return true;
  } catch {
    if (db.isTransaction) db.exec("ROLLBACK");
    return false;
  }
}

/** `syncToDisk: false` skips each commit's disk sync, for files that need not survive a power cut. */
export function openDatabase(databasePath: string, { syncToDisk = true } = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  if (!syncToDisk) db.exec("PRAGMA synchronous = OFF");
  const version = Number((db.prepare("PRAGMA user_version").get() as Row).user_version);
  // A newer app's library is left exactly as it is: migrating it down would lose data.
  if (version > SCHEMA_VERSION) {
    db.close();
    throw storageFailure(
      "This library was saved by a newer version of inkling and is unchanged. Update inkling to open it.",
    );
  }
  if (version < 1) db.exec(itemsSchema);
  else if (version === 1) {
    try {
      db.exec("ALTER TABLE items ADD COLUMN ocr_text TEXT NOT NULL DEFAULT ''");
    } catch {}
  }
  // Before the backfill below: its per-row updates would otherwise each fire the old trigger,
  // which scans the whole library. setupFts rebuilds the index on item rowids afterwards.
  if (version < 11) dropFts(db);
  db.exec(jobsSchema);
  ensureColumns(db, "jobs", [
    ["worker_id", "TEXT"],
    ["lease_until", "INTEGER"],
    ["progress_current", "INTEGER NOT NULL DEFAULT 0"],
    ["progress_total", "INTEGER"],
    ["progress_message", "TEXT"],
  ]);
  migrateItemColumns(db, version < SCHEMA_VERSION);
  // Optional lookup index, including existing version-9 libraries. Invalid legacy
  // metadata is ignored here rather than preventing the library from opening.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_items_screenshot_hash ON items
    (CASE WHEN json_valid(metadata) THEN json_extract(metadata, '$.screenshotHash') END)`);
  db.exec(embeddingsSchema);
  db.exec(spacesSchema);
  db.exec(appSettingsSchema);
  ensureColumns(db, "spaces", [["kind", "TEXT NOT NULL DEFAULT 'smart'"]]);
  const fts5Enabled = setupFts(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { db, fts5Enabled };
}
