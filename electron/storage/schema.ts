import { DatabaseSync } from "node:sqlite";

// Multimodal revisions plus persistent Smart Space exclusions. Upstream's
// separate article-content migration needs its own combined successor.
export const SCHEMA_VERSION = 10;

const searchSchema = `
CREATE TABLE IF NOT EXISTS search_vectors (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  index_version TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','image')),
  chunk_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  dimension INTEGER NOT NULL,
  vector BLOB NOT NULL,
  PRIMARY KEY(item_id,index_version,kind,chunk_id)
);
CREATE INDEX IF NOT EXISTS idx_search_vectors_version ON search_vectors(index_version,kind);
CREATE TABLE IF NOT EXISTS search_chunks (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL,
  source TEXT NOT NULL,
  page INTEGER,
  text TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY(item_id,chunk_id)
);
CREATE TABLE IF NOT EXISTS search_pages (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  asset_path TEXT,
  page INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY(item_id,page)
);
CREATE TABLE IF NOT EXISTS search_ai (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  asset_path TEXT NOT NULL,
  caption TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  removed_tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS search_index_state (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  index_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  PRIMARY KEY(item_id,index_version)
);
CREATE TRIGGER IF NOT EXISTS search_item_revision AFTER UPDATE ON items
WHEN old.title IS NOT new.title OR old.description IS NOT new.description
  OR old.body IS NOT new.body OR old.ocr_text IS NOT new.ocr_text
  OR old.local_asset_path IS NOT new.local_asset_path
  OR json_extract(old.metadata,'$.tags') IS NOT json_extract(new.metadata,'$.tags')
  OR json_extract(old.metadata,'$.text') IS NOT json_extract(new.metadata,'$.text')
  OR json_extract(old.metadata,'$.extractedText') IS NOT json_extract(new.metadata,'$.extractedText')
BEGIN
  UPDATE items SET search_revision = search_revision + 1 WHERE id = new.id;
END;
CREATE TRIGGER IF NOT EXISTS search_item_delete AFTER DELETE ON items BEGIN
  DELETE FROM search_vectors WHERE item_id = old.id;
  DELETE FROM search_chunks WHERE item_id = old.id;
  DELETE FROM search_pages WHERE item_id = old.id;
  DELETE FROM search_ai WHERE item_id = old.id;
  DELETE FROM search_index_state WHERE item_id = old.id;
END;
`;

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

function setupFts(db: DatabaseSync) {
  try {
    db.exec("BEGIN IMMEDIATE");
    const exists = Boolean(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'items_fts'").get(),
    );
    const hasBody = exists && tableHasColumn(db, "items_fts", "body");
    if (exists && !hasBody) {
      db.exec(`
        DROP TRIGGER IF EXISTS items_fts_after_insert;
        DROP TRIGGER IF EXISTS items_fts_after_update;
        DROP TRIGGER IF EXISTS items_fts_after_delete;
        DROP TABLE IF EXISTS items_fts;
      `);
    }
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts USING fts5(item_id UNINDEXED,chunk_id UNINDEXED,text);
      CREATE TRIGGER IF NOT EXISTS search_chunks_insert AFTER INSERT ON search_chunks BEGIN
        INSERT INTO search_chunks_fts(item_id,chunk_id,text) VALUES(new.item_id,new.chunk_id,new.text);
      END;
      CREATE TRIGGER IF NOT EXISTS search_chunks_delete AFTER DELETE ON search_chunks BEGIN
        DELETE FROM search_chunks_fts WHERE item_id = old.item_id AND chunk_id = old.chunk_id;
      END;
      CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
        item_id UNINDEXED, title, description, source_label, ocr_text, metadata, body
      );
      DROP TRIGGER IF EXISTS items_fts_after_insert;
      CREATE TRIGGER items_fts_after_insert AFTER INSERT ON items BEGIN
        INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
        VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata, new.body);
      END;
      DROP TRIGGER IF EXISTS items_fts_after_delete;
      CREATE TRIGGER items_fts_after_delete AFTER DELETE ON items BEGIN
        DELETE FROM items_fts WHERE item_id = old.id;
      END;
      DROP TRIGGER IF EXISTS items_fts_after_update;
      CREATE TRIGGER items_fts_after_update AFTER UPDATE ON items BEGIN
        DELETE FROM items_fts WHERE item_id = old.id;
        INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
        VALUES (new.id, new.title, new.description, new.source_label, new.ocr_text, new.metadata, new.body);
      END;
    `);
    const itemCount = (db.prepare("SELECT COUNT(*) AS count FROM items").get() as Row).count;
    const indexedCount = (db.prepare("SELECT COUNT(*) AS count FROM items_fts").get() as Row).count;
    if (!exists || !hasBody || itemCount !== indexedCount) {
      db.exec(`
        DELETE FROM items_fts;
        INSERT INTO items_fts(item_id, title, description, source_label, ocr_text, metadata, body)
        SELECT id, title, description, source_label, ocr_text, metadata, body FROM items;
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
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `This library uses schema ${version}, newer than supported schema ${SCHEMA_VERSION}. Update inkling before opening it.`,
    );
  }
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
  migrateItemColumns(db, version < SCHEMA_VERSION);
  db.exec(embeddingsSchema);
  db.exec(spacesSchema);
  db.exec(appSettingsSchema);
  ensureColumns(db, "items", [["search_revision", "INTEGER NOT NULL DEFAULT 0"]]);
  db.exec(searchSchema);
  ensureColumns(db, "spaces", [["kind", "TEXT NOT NULL DEFAULT 'smart'"]]);
  const fts5Enabled = setupFts(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { db, fts5Enabled };
}
