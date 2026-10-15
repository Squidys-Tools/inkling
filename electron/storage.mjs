import { createHash, randomUUID } from "node:crypto";
import { createReadStream, mkdirSync, renameSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 8;
export const JOB_LEASE_MILLIS = 5 * 60 * 1000;

const textModel = "nomic-embed-text-v1.5";
const imageModel = "nomic-embed-vision-v1.5";
const maxFileBytes = 50 * 1024 * 1024;
const itemColumns = `id, kind, title, description, source_url, source_label,
  local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
  archived, favorite, NULL AS body, 'md' AS body_format`;
const qualifiedItemColumns = `i.id, i.kind, i.title, i.description, i.source_url, i.source_label,
  i.local_asset_path, i.thumbnail_path, i.ocr_text, i.metadata, i.created_at, i.updated_at,
  i.archived, i.favorite, NULL AS body, 'md' AS body_format`;

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
`;

function nowMillis() {
  return Date.now();
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseObject(value, label = "metadata") {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value;
}

function itemFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    body: row.body,
    bodyFormat: row.body_format,
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    localAssetPath: row.local_asset_path,
    thumbnailPath: row.thumbnail_path,
    ocrText: row.ocr_text,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived !== 0,
    favorite: row.favorite !== 0,
  };
}

function spaceFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    query: parseJson(row.query, {}),
    kind: row.kind,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jobFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    status: row.status,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    progressMessage: row.progress_message,
  };
}

function tableHasColumn(db, table, name) {
  return Boolean(
    db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(name),
  );
}

function ensureColumns(db, table, columns) {
  for (const [name, definition] of columns) {
    if (!tableHasColumn(db, table, name))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

function migrateItemColumns(db, migrationNeeded) {
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
  const rows = db.prepare("SELECT id, kind, description, body, body_format FROM items").all();
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

function setupFts(db) {
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
    const itemCount = db.prepare("SELECT COUNT(*) AS count FROM items").get().count;
    const indexedCount = db.prepare("SELECT COUNT(*) AS count FROM items_fts").get().count;
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

function openDatabase(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA busy_timeout = 5000");
  const version = db.prepare("PRAGMA user_version").get().user_version;
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
  ensureColumns(db, "spaces", [["kind", "TEXT NOT NULL DEFAULT 'smart'"]]);
  const fts5Enabled = setupFts(db);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return { db, fts5Enabled };
}

function nonEmpty(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHttpUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("invalid storage input: sourceUrl must be a valid HTTP or HTTPS URL");
  }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) {
    throw new Error("invalid storage input: sourceUrl must use HTTP or HTTPS and include a host");
  }
  url.hash = "";
  return url.toString();
}

function markdownToPlainText(markdown) {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>|<hr\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, " ")
    .replace(/[*_~]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/ \./g, ".")
    .replace(/ ,/g, ",")
    .replace(/ ;/g, ";")
    .replace(/ :/g, ":")
    .replace(/ !/g, "!")
    .replace(/ \?/g, "?");
}

function validateSmartQuery(query = {}) {
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new Error("invalid storage input: Space query must be an object");
  const clean = (value, field, max) => {
    if (value == null) return undefined;
    if (typeof value !== "string") throw new Error(`invalid storage input: ${field} must be text`);
    const trimmed = value.trim();
    if (Buffer.byteLength(trimmed) > max)
      throw new Error(`invalid storage input: ${field} must be at most ${max} characters`);
    return trimmed || undefined;
  };
  if (query.favorite != null && typeof query.favorite !== "boolean")
    throw new Error("invalid storage input: favorite must be a boolean");
  return {
    text: clean(query.text, "text", 512),
    kind: clean(query.kind, "kind", 32),
    tag: clean(query.tag, "tag", 64),
    favorite: typeof query.favorite === "boolean" ? query.favorite : undefined,
  };
}

function normalizeSpaceName(name) {
  const normalized = String(name ?? "").trim();
  if (!normalized) throw new Error("invalid storage input: space name cannot be empty");
  if (Buffer.byteLength(normalized) > 80)
    throw new Error("invalid storage input: space name must be at most 80 characters");
  return normalized;
}

function parseImportedSpaceQuery(serialized) {
  let query;
  try {
    query = JSON.parse(serialized);
  } catch {
    throw new Error("invalid storage input: the export contains an invalid Space query");
  }
  if (!query || typeof query !== "object" || Array.isArray(query))
    throw new Error("invalid storage input: the export contains an invalid Space query");
  if (Object.keys(query).some((field) => !["text", "kind", "tag", "favorite"].includes(field)))
    throw new Error("invalid storage input: the export contains an unsupported Space query field");
  return validateSmartQuery(query);
}

function validateImportedSpace(space) {
  if (validateItemId(space.id) !== space.id)
    throw new Error("invalid storage input: the export contains an invalid Space id");
  if (typeof space.name !== "string" || !space.name.trim() || Buffer.byteLength(space.name) > 80) {
    throw new Error("invalid storage input: the export contains an invalid Space name");
  }
  if (space.kind !== "smart" && space.kind !== "regular")
    throw new Error("invalid storage input: the export contains an unsupported Space kind");
  return { ...space, query: JSON.stringify(parseImportedSpaceQuery(space.query)) };
}

function normalizeSpaceColor(color) {
  const normalized = nonEmpty(color)?.toLowerCase();
  return ["blue", "orange", "green", "pink", "purple"].includes(normalized) ? normalized : "blue";
}

function validateItemId(id) {
  const value = String(id ?? "").trim();
  if (value.length < 1 || value.length > 128) {
    throw new Error("invalid storage input: item id must contain 1 to 128 characters");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("invalid storage input: item id contains unsupported characters");
  }
  return value;
}

function sanitizeFileName(value) {
  let name = Array.from(String(value ?? "").trim(), (character) =>
    /[\\/:*?"<>|]/.test(character) || /\p{Cc}/u.test(character) ? "_" : character,
  ).join("");
  while (name.endsWith(".") || name.endsWith(" ")) name = name.slice(0, -1);
  if (!name || name === "." || name === "..") {
    throw new Error("invalid storage input: fileName must contain a usable file name");
  }
  name = Array.from(name).slice(0, 128).join("");
  if (name.startsWith(".")) name = `_${name}`;
  const stem = name.split(".")[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) name = `_${name}`;
  return name;
}

function normalizeFileKind(kind, mimeType, fileName) {
  if (nonEmpty(kind)) {
    const value = kind.trim().toLowerCase();
    if (["image", "pdf", "video"].includes(value)) return value;
    if (["file", "other"].includes(value)) return "file";
    throw new Error("invalid storage input: kind must be image, pdf, video, or file");
  }
  const extension = extname(fileName).slice(1).toLowerCase();
  if (
    mimeType?.startsWith("image/") ||
    ["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "tif", "tiff", "webp"].includes(extension)
  )
    return "image";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mimeType?.startsWith("video/") ||
    ["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "webm", "wmv"].includes(extension)
  )
    return "video";
  return "file";
}

function escapeFtsQuery(query) {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replaceAll('"', "")}"`)
    .filter((token) => token !== '""')
    .join(" ");
}

function decodeFloatVector(blob, dimension) {
  if (!blob || blob.byteLength !== dimension * 4) return null;
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  return Array.from({ length: dimension }, (_, index) => bytes.readFloatLE(index * 4));
}

function dotProduct(left, right) {
  if (left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

function clampLimit(value, fallback, maximum) {
  const limit = Number(value);
  return Number.isFinite(limit) ? Math.min(maximum, Math.max(1, Math.trunc(limit))) : fallback;
}

function sqlLikePattern(value) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function itemSelect(db, where, params = [], order = "updated_at DESC, created_at DESC", limit) {
  const limitClause = limit == null ? "" : " LIMIT ?";
  return db
    .prepare(`SELECT ${itemColumns} FROM items WHERE ${where} ORDER BY ${order}${limitClause}`)
    .all(...params, ...(limit == null ? [] : [limit]))
    .map(itemFromRow);
}

function ensureArrayMetadata(metadata, key) {
  if (!(key in metadata)) metadata[key] = [];
  if (!Array.isArray(metadata[key]))
    throw new Error(`invalid storage input: metadata.${key} must be a JSON array`);
}

function relativeAssetPath(path) {
  return `assets/${path.split(sep).join("/")}`;
}

function isInside(candidate, root) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

function exportDateStamp(millis) {
  const date = new Date(millis);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function copyFileAtomically(source, destination) {
  const partial = `${destination}.inkling-export-part`;
  try {
    const bytes = await copyFile(source, partial).then(async () => (await stat(partial)).size);
    await rename(partial, destination);
    return bytes;
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function copyDirectory(source, destination, relativePath, copied) {
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink())
    throw new Error("invalid storage input: an item asset directory is unsafe");
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(destination, entry.name);
    const path = `${relativePath}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      copied.skippedAssets.push({ path, error: "symbolic links are not supported" });
    } else if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, path, copied);
    } else if (entry.isFile()) {
      try {
        const byteLength = await copyFileAtomically(sourcePath, targetPath);
        copied.assetFiles.push({ path, byteLength, sha256: await sha256File(targetPath) });
        copied.assetsBytes += byteLength;
      } catch (error) {
        copied.skippedAssets.push({ path, error: String(error) });
      }
    }
  }
}

async function collectAssetFiles(root, relativeDirectory = "assets/items", results = []) {
  let rootInfo;
  try {
    rootInfo = await lstat(root);
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw error;
  }
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("invalid storage input: the export contains an unsafe asset directory");
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw new Error(
        "invalid storage input: the export contains a symbolic link in its asset files",
      );
    if (entry.isDirectory()) await collectAssetFiles(path, relativePath, results);
    else if (entry.isFile()) results.push(relativePath);
    else throw new Error("invalid storage input: the export contains an unsupported asset file");
  }
  return results;
}

async function verifyExportAsset(exportDirectory, itemId, relativePath) {
  const components = String(relativePath).split("/");
  if (
    components.length < 4 ||
    components[0] !== "assets" ||
    components[1] !== "items" ||
    components[2] !== itemId ||
    components.some(
      (part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes(":"),
    )
  ) {
    throw new Error(
      `invalid storage input: the export contains an unsafe asset path for item ${itemId}`,
    );
  }
  let path = join(exportDirectory, "assets", "items", itemId);
  for (const [index, component] of components.slice(3).entries()) {
    path = join(path, component);
    let info;
    try {
      info = await lstat(path);
    } catch {
      throw new Error(
        `invalid storage input: the export is missing a referenced asset: ${relativePath}`,
      );
    }
    if (
      info.isSymbolicLink() ||
      (index === components.length - 4 ? !info.isFile() : !info.isDirectory())
    ) {
      throw new Error(
        `invalid storage input: the export contains an unsafe or invalid asset: ${relativePath}`,
      );
    }
  }
  return path;
}

async function copyAssetDirectory(source, destination) {
  const info = await lstat(source).catch((error) =>
    error.code === "ENOENT" ? null : Promise.reject(error),
  );
  if (!info) return 0;
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("invalid storage input: the export contains an unsafe item asset folder");
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(
        "invalid storage input: the export contains a symbolic link in its asset files",
      );
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) count += await copyAssetDirectory(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      count += 1;
    } else throw new Error("invalid storage input: the export contains an unsupported asset file");
  }
  return count;
}

export function resolveLibraryDataDirectory({
  executablePath,
  appDataDirectory,
  identifier = "com.inkling.library",
  portable = false,
  overrideDirectory,
}) {
  if (portable) return join(dirname(executablePath), "data");
  if (overrideDirectory) return resolve(overrideDirectory);
  return join(appDataDirectory, identifier);
}

export class JobQueue {
  constructor(db, { now = nowMillis, onUpdated = () => {} } = {}) {
    this.db = db;
    this.now = now;
    this.onUpdated = onUpdated;
  }

  notify(itemId) {
    this.onUpdated(itemId);
  }

  enqueue(itemId, kind, { notify = true } = {}) {
    const existing = this.db
      .prepare(`SELECT id FROM jobs WHERE item_id = ? AND kind = ? AND status IN ('pending', 'processing')
        ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`)
      .get(itemId, kind);
    if (existing) return existing.id;
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO jobs (id, item_id, kind, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(id, itemId, kind, this.now());
    if (notify) this.notify(itemId);
    return id;
  }

  getForItems(itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
    const placeholders = itemIds.map(() => "?").join(", ");
    return this.db
      .prepare(`SELECT * FROM jobs WHERE item_id IN (${placeholders}) ORDER BY created_at DESC`)
      .all(...itemIds)
      .map(jobFromRow);
  }

  getForItem(itemId) {
    return this.db
      .prepare("SELECT * FROM jobs WHERE item_id = ? ORDER BY created_at DESC")
      .all(itemId)
      .map(jobFromRow);
  }

  countActive() {
    return this.db
      .prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('pending', 'processing')")
      .get().count;
  }

  enqueueOcr(itemId) {
    const item = this.db.prepare("SELECT kind FROM items WHERE id = ?").get(itemId);
    if (!item) throw new Error("item not found");
    const kind = item.kind === "image" ? "ocr_image" : item.kind === "pdf" ? "ocr_pdf_page" : null;
    if (!kind) throw new Error("OCR is only available for image and PDF items");
    return this.enqueue(itemId, kind);
  }

  claimNext(workerId, kinds = null) {
    if (Array.isArray(kinds) && kinds.length === 0) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const kindFilter = kinds ? ` AND kind IN (${kinds.map(() => "?").join(", ")})` : "";
      const row = this.db
        .prepare(
          `SELECT * FROM jobs WHERE status = 'pending'${kindFilter} ORDER BY created_at ASC LIMIT 1`,
        )
        .get(...(kinds ?? []));
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      const now = this.now();
      const updated = this.db
        .prepare(`UPDATE jobs SET status = 'processing', started_at = ?, worker_id = ?, lease_until = ?,
          progress_current = 0, progress_message = NULL WHERE id = ? AND status = 'pending'`)
        .run(now, workerId, now + JOB_LEASE_MILLIS, row.id).changes;
      this.db.exec("COMMIT");
      if (!updated) return null;
      this.notify(row.item_id);
      return jobFromRow(this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id));
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  renew(jobId, workerId) {
    const updated =
      this.db
        .prepare(
          `UPDATE jobs SET lease_until = ? WHERE id = ? AND status = 'processing' AND worker_id = ?`,
        )
        .run(this.now() + JOB_LEASE_MILLIS, jobId, workerId).changes > 0;
    if (updated)
      this.notify(this.db.prepare("SELECT item_id FROM jobs WHERE id = ?").get(jobId).item_id);
    return updated;
  }

  complete(jobId, workerId) {
    const item = this.db
      .prepare("SELECT item_id FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?")
      .get(jobId, workerId);
    if (!item) return false;
    const now = this.now();
    const updated =
      this.db
        .prepare(`UPDATE jobs SET status = 'completed', completed_at = ?, error_message = NULL,
      started_at = COALESCE(started_at, ?), worker_id = NULL, lease_until = NULL,
      progress_current = COALESCE(progress_total, progress_current), progress_message = NULL
      WHERE id = ? AND status = 'processing' AND worker_id = ?`)
        .run(now, now, jobId, workerId).changes > 0;
    if (updated) this.notify(item.item_id);
    return updated;
  }

  fail(jobId, workerId, error) {
    const item = this.db
      .prepare("SELECT item_id FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?")
      .get(jobId, workerId);
    if (!item) return false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = this.now();
      const retrying =
        this.db
          .prepare(`UPDATE jobs SET error_message = ?, started_at = COALESCE(started_at, ?)
        WHERE id = ? AND status = 'processing' AND worker_id = ? AND retry_count < max_retries`)
          .run(String(error), now, jobId, workerId).changes > 0;
      if (retrying) {
        this.db
          .prepare(`UPDATE jobs SET status = 'pending', retry_count = retry_count + 1,
          worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
          WHERE id = ? AND status = 'processing' AND worker_id = ?`)
          .run(jobId, workerId);
      } else {
        this.db
          .prepare(`UPDATE jobs SET status = 'failed', completed_at = ?, error_message = ?,
          progress_message = ?, worker_id = NULL, lease_until = NULL
          WHERE id = ? AND status = 'processing' AND worker_id = ?`)
          .run(now, String(error), String(error), jobId, workerId);
      }
      this.db.exec("COMMIT");
      this.notify(item.item_id);
      return true;
    } catch (failure) {
      this.db.exec("ROLLBACK");
      throw failure;
    }
  }

  updateProgress(jobId, workerId, current, total = null, message = null) {
    const item = this.db
      .prepare("SELECT item_id FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?")
      .get(jobId, workerId);
    if (!item) return false;
    const progressCurrent = Math.max(0, Number(current) || 0);
    const progressTotal = total == null ? null : Math.max(progressCurrent, Number(total) || 0);
    const updated =
      this.db
        .prepare(`UPDATE jobs SET progress_current = ?, progress_total = ?, progress_message = ?
      WHERE id = ? AND status = 'processing' AND worker_id = ?`)
        .run(
          progressCurrent,
          progressTotal,
          message == null ? null : String(message),
          jobId,
          workerId,
        ).changes > 0;
    if (updated) this.notify(item.item_id);
    return updated;
  }

  retry(jobId) {
    const row = this.db
      .prepare("SELECT item_id FROM jobs WHERE id = ? AND status = 'failed'")
      .get(jobId);
    if (!row) return false;
    const updated =
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', error_message = NULL,
      started_at = NULL, completed_at = NULL, worker_id = NULL, lease_until = NULL,
      progress_current = 0, progress_message = NULL WHERE id = ? AND status = 'failed'`)
        .run(jobId).changes > 0;
    if (updated) this.notify(row.item_id);
    return updated;
  }

  recoverExpired() {
    const now = this.now();
    let rows;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      rows = this.db
        .prepare(`SELECT item_id FROM jobs WHERE status = 'processing'
        AND (lease_until IS NULL OR lease_until <= ?)`)
        .all(now);
      if (rows.length === 0) {
        this.db.exec("COMMIT");
        return 0;
      }
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', started_at = NULL, error_message = NULL,
        worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
        WHERE status = 'processing' AND (lease_until IS NULL OR lease_until <= ?)`)
        .run(now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    for (const row of rows) this.notify(row.item_id);
    return rows.length;
  }
}

export class JobWorker {
  constructor(storage, { processors = {}, pollInterval = 5000, workerId = randomUUID() } = {}) {
    this.storage = storage;
    this.queue = storage.jobs;
    this.processors = processors;
    this.pollInterval = pollInterval;
    this.workerId = workerId;
    this.timer = null;
    this.running = false;
  }

  start() {
    this.queue.recoverExpired();
    this.timer = setInterval(() => void this.pump(), this.pollInterval);
    this.timer.unref?.();
    void this.pump();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      const kinds = Object.keys(this.processors);
      let job = this.queue.claimNext(this.workerId, kinds);
      while (job) {
        const processor = this.processors[job.kind];
        const heartbeat = setInterval(
          () => this.queue.renew(job.id, this.workerId),
          JOB_LEASE_MILLIS / 2,
        );
        heartbeat.unref?.();
        try {
          await processor(job, this.storage);
          this.queue.complete(job.id, this.workerId);
        } catch (error) {
          this.queue.fail(
            job.id,
            this.workerId,
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          clearInterval(heartbeat);
        }
        job = this.queue.claimNext(this.workerId, kinds);
      }
    } finally {
      this.running = false;
    }
  }
}

export function openLibraryStorage(databasePath, options = {}) {
  const database = resolve(databasePath);
  mkdirSync(dirname(database), { recursive: true });
  const { db, fts5Enabled } = openDatabase(database);
  const jobQueue = new JobQueue(db, options.jobQueue);
  const library = new LibraryStorage(database, db, fts5Enabled, jobQueue, options);
  return library;
}

export class LibraryStorage {
  constructor(databasePath, db, fts5Enabled, jobs, { createThumbnail, createSnapshot } = {}) {
    this.databasePath = databasePath;
    this.assetsRoot = join(dirname(databasePath), "assets");
    this.assetsDirectory = join(this.assetsRoot, "items");
    this.db = db;
    this.fts5Enabled = fts5Enabled;
    this.jobs = jobs;
    this.createThumbnail = createThumbnail;
    this.createSnapshot = createSnapshot;
  }

  status() {
    return {
      databasePath: this.databasePath,
      fts5Enabled: this.fts5Enabled,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  listActiveItems() {
    return itemSelect(this.db, "archived = 0");
  }

  listArchivedItems() {
    return itemSelect(this.db, "archived = 1");
  }

  getItem(id) {
    return itemFromRow(
      this.db
        .prepare(
          `SELECT ${itemColumns.replace("NULL AS body, 'md' AS body_format", "body, body_format")} FROM items WHERE id = ?`,
        )
        .get(id),
    );
  }

  getItemContent(id) {
    const row = this.db.prepare("SELECT id, body, body_format FROM items WHERE id = ?").get(id);
    if (!row) throw new Error(`item not found: ${id}`);
    return { id: row.id, body: row.body, bodyFormat: row.body_format };
  }

  searchItems(query, limit = 100) {
    const search = String(query ?? "").trim();
    const cap = clampLimit(limit, 100, 200);
    if (!search)
      return itemSelect(this.db, "archived = 0", [], "updated_at DESC, created_at DESC", cap);
    let rows;
    if (this.fts5Enabled) {
      const match = escapeFtsQuery(search);
      rows = match
        ? this.db
            .prepare(`SELECT ${qualifiedItemColumns} FROM items_fts f JOIN items i ON i.id = f.item_id
          WHERE i.archived = 0 AND items_fts MATCH ? ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ?`)
            .all(match, cap)
        : [];
    } else {
      const pattern = sqlLikePattern(search);
      rows = this.db
        .prepare(`SELECT ${itemColumns} FROM items WHERE archived = 0
        AND (title COLLATE NOCASE LIKE ? ESCAPE char(92) OR description COLLATE NOCASE LIKE ? ESCAPE char(92)
          OR body COLLATE NOCASE LIKE ? ESCAPE char(92) OR source_label COLLATE NOCASE LIKE ? ESCAPE char(92)
          OR ocr_text COLLATE NOCASE LIKE ? ESCAPE char(92) OR metadata COLLATE NOCASE LIKE ? ESCAPE char(92))
        ORDER BY updated_at DESC, created_at DESC LIMIT ?`)
        .all(pattern, pattern, pattern, pattern, pattern, pattern, cap);
    }
    return rows.map(itemFromRow);
  }

  searchSimilar(itemId, kind, limit = 12) {
    const model = kind === "image" ? imageModel : textModel;
    const source = this.db
      .prepare(
        "SELECT dimension, vector FROM item_embeddings WHERE item_id = ? AND kind = ? AND model = ?",
      )
      .get(itemId, kind, model);
    if (!source) return [];
    const sourceVector = decodeFloatVector(source.vector, source.dimension);
    if (!sourceVector)
      throw new Error(
        `invalid storage input: stored ${kind} embedding dimension does not match its vector`,
      );
    const candidates = this.db
      .prepare(`SELECT ${qualifiedItemColumns}, e.dimension, e.vector FROM item_embeddings e
      JOIN items i ON i.id = e.item_id WHERE i.archived = 0 AND i.id != ?
      AND ((? = 'image' AND i.kind = 'image') OR (? = 'text' AND i.kind IN ('article', 'url', 'note', 'quote')))
      AND e.kind = ? AND e.model = ?`)
      .all(itemId, kind, kind, kind, model);
    return candidates
      .map((row) => ({
        item: itemFromRow(row),
        vector: decodeFloatVector(row.vector, row.dimension),
      }))
      .filter(({ vector }) => vector && vector.length === sourceVector.length)
      .map(({ item, vector }) => ({ item, score: dotProduct(sourceVector, vector) }))
      .sort((left, right) => right.score - left.score)
      .slice(0, clampLimit(limit, 12, 50))
      .map(({ item }) => item);
  }

  createNote(input = {}) {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("invalid storage input: note body cannot be empty");
    const id = randomUUID();
    const now = nowMillis();
    const metadata = input.metadata ?? {};
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, metadata, ocr_text, created_at, updated_at)
        VALUES (?, 'note', ?, ?, ?, 'md', ?, '', ?, ?)`)
        .run(
          id,
          nonEmpty(input.title),
          markdownToPlainText(body),
          body,
          JSON.stringify(metadata),
          now,
          now,
        );
      this.jobs.enqueue(id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.jobs.notify(id);
    return this.getItem(id);
  }

  createQuote(input = {}) {
    const body = String(input.body ?? "").trim();
    if (!body) throw new Error("invalid storage input: quote text cannot be empty");
    if (body.length > 2000)
      throw new Error("invalid storage input: quote text must be at most 2000 characters");
    const attribution = nonEmpty(input.attribution);
    if (attribution && attribution.length > 240)
      throw new Error("invalid storage input: quote attribution must be at most 240 characters");
    const sourceUrl = nonEmpty(input.sourceUrl) ? normalizeHttpUrl(input.sourceUrl) : null;
    const sourceLabel = sourceUrl
      ? new URL(sourceUrl).hostname
      : attribution?.split(",")[0].trim() || null;
    const metadata = parseObject(input.metadata);
    metadata.quoteText = body;
    if (attribution) metadata.attribution = attribution;
    if (sourceUrl) metadata.sourceUrl = sourceUrl;
    metadata.text = attribution ? `${body}\n\n${attribution}` : body;
    const id = randomUUID();
    const now = nowMillis();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, source_url, source_label,
        metadata, ocr_text, created_at, updated_at) VALUES (?, 'quote', ?, ?, '', '', ?, ?, ?, '', ?, ?)`)
        .run(id, body, attribution, sourceUrl, sourceLabel, JSON.stringify(metadata), now, now);
      this.jobs.enqueue(id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.jobs.notify(id);
    return this.getItem(id);
  }

  createUrl(input = {}) {
    const sourceUrl = normalizeHttpUrl(input.sourceUrl ?? "");
    const sourceLabel = new URL(sourceUrl).hostname;
    const title = nonEmpty(input.title) ?? sourceLabel;
    const description = nonEmpty(input.description);
    const body = String(input.body ?? "").trim();
    const metadata = parseObject(input.metadata);
    if (!("sourceUrl" in metadata)) metadata.sourceUrl = sourceUrl;
    if (!("text" in metadata)) metadata.text = body;
    for (const key of ["imageUrls", "imageDimensions", "safeEmbeds"])
      ensureArrayMetadata(metadata, key);
    if (!("html" in metadata)) metadata.html = "";
    const id = randomUUID();
    const now = nowMillis();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, source_url, source_label,
        metadata, ocr_text, created_at, updated_at) VALUES (?, 'url', ?, ?, '', '', ?, ?, ?, '', ?, ?)`)
        .run(id, title, description, sourceUrl, sourceLabel, JSON.stringify(metadata), now, now);
      this.jobs.enqueue(id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.jobs.notify(id);
    return this.getItem(id);
  }

  async saveFile(input = {}) {
    const fileName = sanitizeFileName(input.fileName);
    const id = validateItemId(input.id ?? randomUUID());
    const mimeType = nonEmpty(input.mimeType)?.toLowerCase() ?? null;
    const kind = normalizeFileKind(input.kind, mimeType, fileName);
    const bytes = Buffer.from(input.bytes ?? []);
    if (bytes.length > maxFileBytes)
      throw new Error("invalid storage input: file exceeds the 50 MB input limit");
    if (bytes.length === 0) throw new Error("invalid storage input: file bytes cannot be empty");
    let thumbnail = null;
    if (kind === "image") {
      if (!this.createThumbnail) throw new Error("image thumbnail generation is unavailable");
      thumbnail = await this.createThumbnail(bytes);
    }
    const itemDirectory = join(this.assetsDirectory, id);
    await mkdir(itemDirectory, { recursive: true });
    const originalPath = join(itemDirectory, fileName);
    await writeFile(originalPath, bytes);
    let thumbnailPath = null;
    let dimensions = null;
    if (thumbnail) {
      await writeFile(join(itemDirectory, "thumbnail.webp"), thumbnail.bytes);
      thumbnailPath = `assets/items/${id}/thumbnail.webp`;
      dimensions = [thumbnail.width, thumbnail.height];
    }
    const metadata = {
      fileName,
      mimeType,
      byteLength: bytes.length,
      ...(dimensions ? { mediaWidth: dimensions[0], mediaHeight: dimensions[1] } : {}),
    };
    const now = nowMillis();
    const title = fileName;
    const existing = this.getItem(id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (existing) {
        this.db
          .prepare(`UPDATE items SET kind = ?, title = ?, description = NULL, body = '', body_format = 'md',
          source_label = ?, local_asset_path = ?, thumbnail_path = ?, ocr_text = '', metadata = ?, archived = 0,
          updated_at = ? WHERE id = ?`)
          .run(
            kind,
            title,
            mimeType,
            relativeAssetPath(`items/${id}/${fileName}`),
            thumbnailPath,
            JSON.stringify(metadata),
            now,
            id,
          );
      } else {
        this.db
          .prepare(`INSERT INTO items (id, kind, title, body, body_format, source_label, local_asset_path,
          thumbnail_path, metadata, ocr_text, created_at, updated_at) VALUES (?, ?, ?, '', 'md', ?, ?, ?, ?, '', ?, ?)`)
          .run(
            id,
            kind,
            title,
            mimeType,
            relativeAssetPath(`items/${id}/${fileName}`),
            thumbnailPath,
            JSON.stringify(metadata),
            now,
            now,
          );
      }
      if (kind === "image") this.jobs.enqueue(id, "ocr_image", { notify: false });
      if (kind === "pdf") this.jobs.enqueue(id, "ocr_pdf_page", { notify: false });
      this.jobs.enqueue(id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.jobs.notify(id);
    return this.getItem(id);
  }

  resolveAssetPath(assetPath) {
    const normalized = String(assetPath ?? "").replaceAll("\\", "/");
    if (!normalized.startsWith("assets/"))
      throw new Error(
        "invalid storage input: asset path must be relative to the managed assets directory",
      );
    const parts = normalized.slice("assets/".length).split("/");
    if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":"))) {
      throw new Error("invalid storage input: asset path contains an unsafe segment");
    }
    const candidate = resolve(this.assetsRoot, ...parts);
    if (!isInside(candidate, this.assetsRoot))
      throw new Error("invalid storage input: asset path escaped the managed assets directory");
    return realpath(candidate).then((realCandidate) =>
      realpath(this.assetsRoot).then((root) => {
        if (!isInside(realCandidate, root))
          throw new Error("invalid storage input: asset path escaped the managed assets directory");
        return realCandidate;
      }),
    );
  }

  updateItem(input = {}) {
    let metadata = input.metadata;
    if (input.addTag != null) {
      const tag = String(input.addTag).trim().replace(/^#+/, "").trim().toLowerCase();
      if (!tag) throw new Error("invalid storage input: tag cannot be empty");
      metadata = metadata ?? this.getItem(input.id)?.metadata;
      if (!metadata) throw new Error(`item not found: ${input.id}`);
      metadata = parseObject(metadata, "metadata");
      if (metadata.tags == null) metadata.tags = [];
      if (!Array.isArray(metadata.tags))
        throw new Error("invalid storage input: metadata tags must be an array to add a tag");
      if (!metadata.tags.some((value) => typeof value === "string" && value.toLowerCase() === tag))
        metadata.tags.push(tag);
    }
    const body = input.body == null ? null : String(input.body).trim();
    if (body != null && !body) throw new Error("invalid storage input: body cannot be empty");
    const bodyFormat =
      input.bodyFormat == null
        ? body == null
          ? null
          : "md"
        : String(input.bodyFormat).trim().toLowerCase() === "md" || !String(input.bodyFormat).trim()
          ? "md"
          : (() => {
              throw new Error("invalid storage input: bodyFormat must be 'md'");
            })();
    const description =
      input.description == null
        ? body == null
          ? null
          : markdownToPlainText(body)
        : String(input.description).trim();
    const updated = this.db
      .prepare(`UPDATE items SET title = COALESCE(?, title), description = COALESCE(?, description),
      body = COALESCE(?, body), body_format = COALESCE(?, body_format), source_url = COALESCE(?, source_url),
      source_label = COALESCE(?, source_label), local_asset_path = COALESCE(?, local_asset_path),
      thumbnail_path = COALESCE(?, thumbnail_path), metadata = COALESCE(?, metadata), favorite = COALESCE(?, favorite),
      updated_at = ? WHERE id = ?`)
      .run(
        input.title == null ? null : String(input.title).trim(),
        description,
        body,
        bodyFormat,
        input.sourceUrl ?? null,
        input.sourceLabel ?? null,
        input.localAssetPath ?? null,
        input.thumbnailPath ?? null,
        metadata == null ? null : JSON.stringify(metadata),
        typeof input.favorite === "boolean" ? Number(input.favorite) : null,
        nowMillis(),
        input.id,
      ).changes;
    if (!updated) throw new Error(`item not found: ${input.id}`);
    const shouldReembed = [
      "title",
      "description",
      "body",
      "bodyFormat",
      "metadata",
      "addTag",
      "localAssetPath",
    ].some((key) => input[key] != null);
    if (shouldReembed) this.jobs.enqueue(input.id, "generate_embedding");
    return this.getItem(input.id);
  }

  archiveItem(id, archived = true) {
    const updated = this.db
      .prepare("UPDATE items SET archived = ?, updated_at = ? WHERE id = ?")
      .run(Number(Boolean(archived)), nowMillis(), id).changes;
    if (!updated) throw new Error(`item not found: ${id}`);
    return this.getItem(id);
  }

  async deleteItem(id) {
    const row = this.db.prepare("SELECT id FROM items WHERE id = ? AND archived = 1").get(id);
    if (!row) throw new Error(`item not found: ${id}`);
    let pendingAssetRemoval;
    if (/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      const assetDirectory = join(this.assetsDirectory, id);
      pendingAssetRemoval = `${assetDirectory}.delete-${randomUUID()}`;
      try {
        renameSync(assetDirectory, pendingAssetRemoval);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        pendingAssetRemoval = undefined;
      }
    }
    try {
      this.db.exec("BEGIN IMMEDIATE");
      const deleted = this.db
        .prepare("DELETE FROM items WHERE id = ? AND archived = 1")
        .run(id).changes;
      if (!deleted) throw new Error(`item not found: ${id}`);
      this.db.prepare("DELETE FROM space_items WHERE item_id = ?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      if (pendingAssetRemoval) renameSync(pendingAssetRemoval, join(this.assetsDirectory, id));
      throw error;
    }
    if (pendingAssetRemoval) await rm(pendingAssetRemoval, { recursive: true, force: true });
  }

  listSpaces() {
    return this.db
      .prepare("SELECT * FROM spaces ORDER BY position, created_at")
      .all()
      .map(spaceFromRow);
  }

  getSpace(id) {
    return spaceFromRow(this.db.prepare("SELECT * FROM spaces WHERE id = ?").get(id));
  }

  createSpace(input = {}) {
    const name = normalizeSpaceName(input.name);
    const kind = input.kind ?? "smart";
    if (kind !== "smart" && kind !== "regular")
      throw new Error("invalid storage input: Space kind must be smart or regular");
    const query = kind === "regular" ? {} : validateSmartQuery(input.query);
    const id = randomUUID();
    const now = nowMillis();
    const position = this.db
      .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM spaces")
      .get().next;
    this.db
      .prepare(
        "INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        name,
        normalizeSpaceColor(input.color),
        JSON.stringify(query),
        kind,
        position,
        now,
        now,
      );
    return this.getSpace(id);
  }

  updateSpace(input = {}) {
    if (input.query != null && this.getSpace(input.id)?.kind === "regular") {
      throw new Error("invalid storage input: a Regular Space has no search query to change");
    }
    if (input.query != null && !this.getSpace(input.id))
      throw new Error(`space not found: ${input.id}`);
    const query = input.query == null ? null : JSON.stringify(validateSmartQuery(input.query));
    const updated = this.db
      .prepare(`UPDATE spaces SET name = COALESCE(?, name), color = COALESCE(?, color),
      query = COALESCE(?, query), position = COALESCE(?, position), updated_at = ? WHERE id = ?`)
      .run(
        input.name == null ? null : normalizeSpaceName(input.name),
        input.color == null ? null : normalizeSpaceColor(input.color),
        query,
        input.position ?? null,
        nowMillis(),
        input.id,
      ).changes;
    if (!updated) throw new Error(`space not found: ${input.id}`);
    return this.getSpace(input.id);
  }

  deleteSpace(id) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM space_items WHERE space_id = ?").run(id);
      const deleted = this.db.prepare("DELETE FROM spaces WHERE id = ?").run(id).changes;
      if (!deleted) throw new Error(`space not found: ${id}`);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  swapSpacePositions(firstId, secondId) {
    if (firstId === secondId) {
      if (!this.getSpace(firstId)) throw new Error(`space not found: ${firstId}`);
      return this.listSpaces();
    }
    const rows = this.db
      .prepare("SELECT id, position FROM spaces WHERE id IN (?, ?)")
      .all(firstId, secondId);
    if (rows.length !== 2) {
      const missing = rows.some((row) => row.id === firstId) ? secondId : firstId;
      throw new Error(`space not found: ${missing}`);
    }
    const firstPosition = rows.find((row) => row.id === firstId).position;
    const secondPosition = rows.find((row) => row.id === secondId).position;
    this.db
      .prepare(`UPDATE spaces SET position = CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE position END,
      updated_at = ? WHERE id IN (?, ?)`)
      .run(firstId, secondPosition, secondId, firstPosition, nowMillis(), firstId, secondId);
    return this.listSpaces();
  }

  listSpaceItems(id, limit = 100) {
    const space = this.getSpace(id);
    if (!space) throw new Error(`space not found: ${id}`);
    const cap = clampLimit(limit, 100, 200);
    if (space.kind === "regular") {
      const rows = this.db
        .prepare(`SELECT ${qualifiedItemColumns} FROM space_items s JOIN items i ON i.id = s.item_id
        WHERE s.space_id = ? AND i.archived = 0 ORDER BY s.added_at DESC, i.id LIMIT ?`)
        .all(id, cap);
      return rows.map(itemFromRow);
    }
    const query = space.query;
    const text = nonEmpty(query.text);
    const clauses = ["i.archived = 0"];
    const values = [];
    let from = "items i";
    if (text && this.fts5Enabled) {
      const match = escapeFtsQuery(text);
      if (!match) return [];
      from = "items_fts f JOIN items i ON i.id = f.item_id";
      clauses.push("items_fts MATCH ?");
      values.push(match);
    } else if (text) {
      const pattern = sqlLikePattern(text);
      clauses.push(`(i.title COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.description COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.body COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.source_label COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.ocr_text COLLATE NOCASE LIKE ? ESCAPE char(92)
        OR i.metadata COLLATE NOCASE LIKE ? ESCAPE char(92))`);
      values.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }
    if (query.favorite != null) {
      clauses.push("i.favorite = ?");
      values.push(Number(query.favorite));
    }
    if (nonEmpty(query.tag)) {
      clauses.push(
        "EXISTS (SELECT 1 FROM json_each(i.metadata, '$.tags') WHERE type = 'text' AND lower(value) = lower(?))",
      );
      values.push(query.tag.trim());
    }
    if (nonEmpty(query.kind)) {
      if (query.kind.trim().toLowerCase() === "article") {
        clauses.push("i.kind IN ('url', 'article')");
      } else {
        clauses.push("lower(i.kind) = lower(?)");
        values.push(query.kind.trim());
      }
    }
    const rows = this.db
      .prepare(`SELECT ${qualifiedItemColumns} FROM ${from} WHERE ${clauses.join(" AND ")}
      ORDER BY i.updated_at DESC, i.created_at DESC LIMIT ?`)
      .all(...values, cap);
    return rows.map(itemFromRow);
  }

  addSpaceItem(spaceId, itemId) {
    const space = this.getSpace(spaceId);
    if (!space) throw new Error(`space not found: ${spaceId}`);
    if (space.kind !== "regular")
      throw new Error("invalid storage input: items can only be added to a Regular Space");
    if (!this.getItem(itemId)) throw new Error(`item not found: ${itemId}`);
    this.db
      .prepare("INSERT OR IGNORE INTO space_items (space_id, item_id, added_at) VALUES (?, ?, ?)")
      .run(spaceId, itemId, nowMillis());
  }

  removeSpaceItem(spaceId, itemId) {
    if (!this.getSpace(spaceId)) throw new Error(`space not found: ${spaceId}`);
    this.db
      .prepare("DELETE FROM space_items WHERE space_id = ? AND item_id = ?")
      .run(spaceId, itemId);
  }

  listItemSpaces(itemId) {
    return this.db
      .prepare(`SELECT s.id FROM space_items m JOIN spaces s ON s.id = m.space_id
      WHERE m.item_id = ? ORDER BY s.position, s.created_at`)
      .all(itemId)
      .map((row) => row.id);
  }

  async exportLibrary(destination, timezoneOffsetMinutes = new Date().getTimezoneOffset()) {
    const target = resolve(String(destination ?? ""));
    let targetInfo;
    try {
      targetInfo = await stat(target);
    } catch {
      throw new Error("invalid storage input: choose an existing folder to export into");
    }
    if (!targetInfo.isDirectory())
      throw new Error("invalid storage input: choose an existing folder to export into");
    const assetsRoot = await realpath(this.assetsRoot).catch(() => this.assetsRoot);
    const realTarget = await realpath(target);
    if (isInside(realTarget, assetsRoot))
      throw new Error("invalid storage input: choose a folder outside inkling's own asset store");
    const exportedAt = nowMillis();
    const wallClock = exportedAt - Number(timezoneOffsetMinutes || 0) * 60_000;
    const stamp = exportDateStamp(wallClock);
    let directory = join(target, `inkling-export-${stamp}`);
    for (
      let index = 2;
      await stat(directory).then(
        () => true,
        () => false,
      );
      index += 1
    ) {
      if (index >= 1000)
        throw new Error("all export directory names for this timestamp are already in use");
      directory = join(target, `inkling-export-${stamp}-${index}`);
    }
    await mkdir(directory);
    try {
      const databasePath = join(directory, "library.sqlite3");
      if (this.createSnapshot) await this.createSnapshot(this.databasePath, databasePath);
      else this.db.prepare("VACUUM INTO ?").run(databasePath);
      const snapshotDb = new DatabaseSync(databasePath, { readOnly: true });
      let itemIds;
      let archivedItems;
      let spaces;
      try {
        itemIds = snapshotDb
          .prepare("SELECT id FROM items")
          .all()
          .map((row) => row.id);
        archivedItems = snapshotDb
          .prepare("SELECT COUNT(*) AS count FROM items WHERE archived = 1")
          .get().count;
        spaces = snapshotDb.prepare("SELECT COUNT(*) AS count FROM spaces").get().count;
      } finally {
        snapshotDb.close();
      }
      const databaseBytes = (await stat(databasePath)).size;
      const copied = { assetFiles: [], skippedAssets: [], assetsBytes: 0 };
      for (const id of itemIds) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) continue;
        const source = join(this.assetsDirectory, id);
        const info = await stat(source).catch((error) =>
          error.code === "ENOENT" ? null : Promise.reject(error),
        );
        if (!info) continue;
        if (!info.isDirectory()) {
          copied.skippedAssets.push({
            path: `assets/items/${id}`,
            error: "asset path is not a directory",
          });
          continue;
        }
        await copyDirectory(
          source,
          join(directory, "assets", "items", id),
          `assets/items/${id}`,
          copied,
        );
      }
      const manifest = {
        format: "inkling-export",
        formatVersion: 1,
        appVersion: "0.1.0",
        schemaVersion: SCHEMA_VERSION,
        exportedAt,
        counts: {
          items: itemIds.length,
          archivedItems,
          spaces,
          assetFiles: copied.assetFiles.length,
          skippedAssets: copied.skippedAssets.length,
        },
        bytes: { database: databaseBytes, assets: copied.assetsBytes },
        assetFiles: copied.assetFiles,
        skippedAssets: copied.skippedAssets,
        regenerable: { tables: ["item_embeddings", "items_fts"], columns: ["items.ocr_text"] },
      };
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      return {
        directory,
        items: itemIds.length,
        archivedItems,
        spaces,
        assetFiles: copied.assetFiles.length,
        skippedAssets: copied.skippedAssets.length,
        databaseBytes,
        assetsBytes: copied.assetsBytes,
      };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  async importLibrary(exportDirectory) {
    const exportRoot = await realpath(String(exportDirectory ?? "")).catch(() => null);
    if (!exportRoot)
      throw new Error("invalid storage input: choose an existing Inkling export folder");
    const exportInfo = await stat(exportRoot);
    if (!exportInfo.isDirectory())
      throw new Error("invalid storage input: choose an existing Inkling export folder");
    const libraryDirectory = dirname(this.databasePath);
    const assetsRoot = await realpath(this.assetsRoot).catch(() => this.assetsRoot);
    if (isInside(exportRoot, assetsRoot))
      throw new Error("choose an export folder outside inkling's asset store");
    const manifestPath = join(exportRoot, "manifest.json");
    const manifestInfo = await lstat(manifestPath).catch(() => null);
    if (!manifestInfo?.isFile() || manifestInfo.isSymbolicLink())
      throw new Error("invalid storage input: the selected folder is missing manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.format !== "inkling-export" || manifest.formatVersion !== 1) {
      throw new Error(
        "invalid storage input: the selected folder is not a supported Inkling export",
      );
    }
    if (manifest.schemaVersion < 1 || manifest.schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        "invalid storage input: the export was created by an unsupported library version",
      );
    }
    if (
      Number(manifest.counts?.skippedAssets ?? 0) !== 0 ||
      (manifest.skippedAssets ?? []).length > 0
    ) {
      const count = Math.max(
        Number(manifest.counts?.skippedAssets ?? 0),
        (manifest.skippedAssets ?? []).length,
      );
      throw new Error(
        `invalid storage input: this export is incomplete: ${count} asset files were skipped during export; create a complete export before restoring it`,
      );
    }
    const sourceDatabasePath = join(exportRoot, "library.sqlite3");
    const databaseInfo = await lstat(sourceDatabasePath).catch(() => null);
    if (!databaseInfo?.isFile() || databaseInfo.isSymbolicLink())
      throw new Error("invalid storage input: library.sqlite3 must be a regular file");
    const sourceDb = new DatabaseSync(sourceDatabasePath, { readOnly: true });
    let schemaVersion;
    let integrity;
    try {
      schemaVersion = sourceDb.prepare("PRAGMA user_version").get().user_version;
      integrity = sourceDb.prepare("PRAGMA integrity_check").get().integrity_check;
    } finally {
      sourceDb.close();
    }
    if (schemaVersion !== manifest.schemaVersion)
      throw new Error("invalid storage input: the export manifest does not match its database");
    if (integrity !== "ok")
      throw new Error("invalid storage input: the export database failed its integrity check");

    const stageRoot = await mkdtemp(join(libraryDirectory, ".inkling-import-"));
    const stageDatabase = join(stageRoot, "library.sqlite3");
    let stage;
    const movedAssetDirectories = [];
    try {
      await copyFile(sourceDatabasePath, stageDatabase);
      stage = openLibraryStorage(stageDatabase);
      const items = stage.db
        .prepare(`SELECT id, kind, title, description, body, body_format, source_url,
        source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
        archived, favorite FROM items ORDER BY created_at, id`)
        .all();
      const spaces = stage.db
        .prepare("SELECT * FROM spaces ORDER BY position, created_at, id")
        .all()
        .map(validateImportedSpace);
      const memberships = stage.db
        .prepare(
          "SELECT space_id, item_id, added_at FROM space_items ORDER BY added_at, space_id, item_id",
        )
        .all();
      if (
        items.length !== Number(manifest.counts?.items) ||
        spaces.length !== Number(manifest.counts?.spaces)
      ) {
        throw new Error(
          "invalid storage input: the export manifest counts do not match its database",
        );
      }
      for (const item of items) {
        if (validateItemId(item.id) !== item.id)
          throw new Error("invalid storage input: the export contains an unsafe item id");
        try {
          item.metadata = JSON.stringify(JSON.parse(item.metadata));
        } catch {
          throw new Error("invalid storage input: the export contains invalid item metadata");
        }
      }
      const itemIds = new Set(items.map((item) => item.id));
      const spaceIds = new Set(spaces.map((space) => space.id));
      if (
        memberships.some(
          (membership) => !spaceIds.has(membership.space_id) || !itemIds.has(membership.item_id),
        )
      ) {
        throw new Error("invalid storage input: the export contains incomplete Space memberships");
      }
      const existingItemIds = new Set(
        this.db
          .prepare("SELECT id FROM items")
          .all()
          .map((row) => row.id),
      );
      const actualPaths = await collectAssetFiles(join(exportRoot, "assets", "items")).catch(
        (error) => {
          if (error.code === "ENOENT") return [];
          throw error;
        },
      );
      const assetFileCounts = new Map();
      for (const path of actualPaths) {
        const itemId = path.split("/")[2];
        assetFileCounts.set(itemId, (assetFileCounts.get(itemId) ?? 0) + 1);
      }
      for (const itemId of itemIds) {
        if (existingItemIds.has(itemId)) continue;
        const source = join(exportRoot, "assets", "items", itemId);
        const destination = join(stageRoot, "assets", "items", itemId);
        if (
          await lstat(source).then(
            (info) => info.isDirectory(),
            () => false,
          )
        ) {
          await copyAssetDirectory(source, destination);
        }
      }
      for (const item of items) {
        for (const assetPath of [item.local_asset_path, item.thumbnail_path].filter(Boolean)) {
          await verifyExportAsset(exportRoot, item.id, assetPath);
          if (item.local_asset_path === assetPath) {
            const expected = parseJson(item.metadata, {}).byteLength;
            if (
              expected != null &&
              (await stat(await verifyExportAsset(exportRoot, item.id, assetPath))).size !==
                Number(expected)
            ) {
              throw new Error(
                `invalid storage input: the export contains a damaged asset with an unexpected size: ${assetPath}`,
              );
            }
          }
        }
      }
      if (Number(manifest.counts?.assetFiles) !== actualPaths.length) {
        throw new Error(
          "invalid storage input: the export manifest asset count does not match its files",
        );
      }
      let unverifiedAssetFiles = actualPaths.length;
      if (Array.isArray(manifest.assetFiles)) {
        if (manifest.assetFiles.length !== actualPaths.length)
          throw new Error(
            "invalid storage input: the export manifest asset list does not match its files",
          );
        const listedPaths = new Set();
        for (const asset of manifest.assetFiles) {
          const components = String(asset.path).split("/");
          const assetItemId = components[2];
          if (!itemIds.has(assetItemId) || !/^[0-9a-f]{64}$/i.test(asset.sha256)) {
            throw new Error(
              "invalid storage input: the export manifest contains an invalid asset entry",
            );
          }
          const path = await verifyExportAsset(exportRoot, assetItemId, asset.path);
          if (
            (await stat(path)).size !== Number(asset.byteLength) ||
            (await sha256File(path)).toLowerCase() !== asset.sha256.toLowerCase()
          ) {
            throw new Error(
              `invalid storage input: the export contains a damaged asset: ${asset.path}`,
            );
          }
          if (listedPaths.has(asset.path))
            throw new Error(
              "invalid storage input: the export manifest contains a duplicate asset path",
            );
          listedPaths.add(asset.path);
        }
        if (actualPaths.some((path) => !listedPaths.has(path)))
          throw new Error(
            "invalid storage input: the export manifest asset list does not match its files",
          );
        for (const item of items) {
          for (const path of [item.local_asset_path, item.thumbnail_path].filter(Boolean)) {
            if (!listedPaths.has(path))
              throw new Error(
                `invalid storage input: the export manifest is missing an integrity record for asset: ${path}`,
              );
          }
        }
        unverifiedAssetFiles = 0;
      }

      const assetFilesByItem = new Map();
      try {
        for (const item of items) {
          if (existingItemIds.has(item.id)) continue;
          const stagedAssets = join(stageRoot, "assets", "items", item.id);
          const targetAssets = join(this.assetsDirectory, item.id);
          const stagedInfo = await lstat(stagedAssets).catch((error) =>
            error.code === "ENOENT" ? null : Promise.reject(error),
          );
          if (stagedInfo?.isDirectory()) {
            if (
              await lstat(targetAssets).then(
                () => true,
                () => false,
              )
            ) {
              throw new Error(
                `invalid storage input: asset files already exist for item ${item.id}; refusing to overwrite them`,
              );
            }
            await mkdir(dirname(targetAssets), { recursive: true });
            await rename(stagedAssets, targetAssets);
            movedAssetDirectories.push(targetAssets);
            assetFilesByItem.set(item.id, assetFileCounts.get(item.id) ?? 0);
          } else if (item.local_asset_path || item.thumbnail_path) {
            throw new Error(
              `invalid storage input: asset files for item ${item.id} could not be staged`,
            );
          }
        }
      } catch (error) {
        for (const directory of movedAssetDirectories)
          await rm(directory, { recursive: true, force: true });
        throw error;
      }
      const importedItemIds = new Set();
      const importedSpaceIds = new Set();
      let assetFiles = 0;
      let importedItems = 0;
      let skippedDuplicateItems = 0;
      let importedSpaces = 0;
      let skippedDuplicateSpaces = 0;
      try {
        this.db.exec("BEGIN IMMEDIATE");
        const currentItemIds = new Set(
          this.db
            .prepare("SELECT id FROM items")
            .all()
            .map((row) => row.id),
        );
        const currentSpaceIds = new Set(
          this.db
            .prepare("SELECT id FROM spaces")
            .all()
            .map((row) => row.id),
        );
        for (const item of items) {
          if (currentItemIds.has(item.id)) {
            if (assetFilesByItem.has(item.id)) {
              throw new Error("the active library changed while the export was being checked");
            }
            skippedDuplicateItems += 1;
            continue;
          }
          this.db
            .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, source_url,
            source_label, local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at, archived, favorite)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
              item.id,
              item.kind,
              item.title,
              item.description,
              item.body ?? "",
              item.body_format ?? "md",
              item.source_url,
              item.source_label,
              item.local_asset_path,
              item.thumbnail_path,
              item.ocr_text,
              item.metadata,
              item.created_at,
              item.updated_at,
              item.archived,
              item.favorite,
            );
          if (item.kind === "image") this.jobs.enqueue(item.id, "ocr_image", { notify: false });
          if (item.kind === "pdf") this.jobs.enqueue(item.id, "ocr_pdf_page", { notify: false });
          this.jobs.enqueue(item.id, "generate_embedding", { notify: false });
          importedItemIds.add(item.id);
          importedItems += 1;
          assetFiles += assetFilesByItem.get(item.id) ?? 0;
        }
        let nextPosition = this.db
          .prepare("SELECT COALESCE(MAX(position), -1) AS value FROM spaces")
          .get().value;
        for (const space of spaces) {
          if (currentSpaceIds.has(space.id)) {
            skippedDuplicateSpaces += 1;
            continue;
          }
          nextPosition += 1;
          this.db
            .prepare(`INSERT INTO spaces (id, name, color, query, kind, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(
              space.id,
              space.name,
              normalizeSpaceColor(space.color),
              space.query,
              space.kind,
              nextPosition,
              space.created_at,
              space.updated_at,
            );
          importedSpaceIds.add(space.id);
          importedSpaces += 1;
        }
        for (const membership of memberships) {
          if (
            importedSpaceIds.has(membership.space_id) &&
            (importedItemIds.has(membership.item_id) || currentItemIds.has(membership.item_id))
          ) {
            this.db
              .prepare(
                "INSERT OR IGNORE INTO space_items (space_id, item_id, added_at) VALUES (?, ?, ?)",
              )
              .run(membership.space_id, membership.item_id, membership.added_at);
          }
        }
        this.db.exec("COMMIT");
      } catch (error) {
        if (this.db.isTransaction) this.db.exec("ROLLBACK");
        for (const directory of movedAssetDirectories)
          await rm(directory, { recursive: true, force: true });
        throw error;
      }
      for (const itemId of importedItemIds) this.jobs.notify(itemId);
      return {
        importedItems,
        skippedDuplicateItems,
        importedSpaces,
        skippedDuplicateSpaces,
        assetFiles,
        unverifiedAssetFiles,
      };
    } finally {
      stage?.db.close();
      await rm(stageRoot, { recursive: true, force: true });
    }
  }
}
