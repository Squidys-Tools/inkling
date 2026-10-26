import { randomUUID } from "node:crypto";
import { renameSync } from "node:fs";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { types } from "node:util";
import { IMAGE_THUMBNAIL_JOB, URL_ENRICHMENT_JOB, VIDEO_POSTER_JOB } from "./jobs.mjs";
import {
  isInside,
  itemColumns,
  itemFromRow,
  itemSelect,
  markdownToPlainText,
  nonEmpty,
  normalizeHttpUrl,
  nowMillis,
  parseObject,
  validateItemId,
} from "./shared.mjs";

const maxFileBytes = 50 * 1024 * 1024;

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

// File bytes cross IPC as a Uint8Array or ArrayBuffer, which structured clone
// moves as one block. A number array would be several times larger and slow.
function fileInputBuffer(value) {
  if (types.isAnyArrayBuffer(value)) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new Error("invalid storage input: file bytes must be a Uint8Array or ArrayBuffer");
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

function ensureArrayMetadata(metadata, key) {
  if (!(key in metadata)) metadata[key] = [];
  if (!Array.isArray(metadata[key]))
    throw new Error(`invalid storage input: metadata.${key} must be a JSON array`);
}

function relativeAssetPath(path) {
  return `assets/${path.split(sep).join("/")}`;
}

function saveUrl(storage, input) {
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
  storage.db.exec("BEGIN IMMEDIATE");
  try {
    storage.db
      .prepare(`INSERT INTO items (id, kind, title, description, body, body_format, source_url, source_label,
      metadata, ocr_text, created_at, updated_at) VALUES (?, 'url', ?, ?, '', '', ?, ?, ?, '', ?, ?)`)
      .run(id, title, description, sourceUrl, sourceLabel, JSON.stringify(metadata), now, now);
    storage.jobs.enqueue(id, URL_ENRICHMENT_JOB, { notify: false });
    storage.db.exec("COMMIT");
  } catch (error) {
    storage.db.exec("ROLLBACK");
    throw error;
  }
  storage.jobs.notify(id);
  return storage.getItem(id);
}

export const itemMethods = {
  listActiveItems() {
    return itemSelect(this.db, "archived = 0");
  },

  listArchivedItems() {
    return itemSelect(this.db, "archived = 1");
  },

  // Active items only, so an archived or deleted id is simply absent from the
  // result. The ids go in as one JSON value to stay under SQLite's parameter limit.
  getItemCards(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return itemSelect(this.db, "archived = 0 AND id IN (SELECT value FROM json_each(?))", [
      JSON.stringify(ids),
    ]);
  },

  getItem(id) {
    const row = this.db
      .prepare(
        `SELECT ${itemColumns.replace("NULL AS body, 'md' AS body_format", "body, body_format")} FROM items WHERE id = ?`,
      )
      .get(id);
    return row ? itemFromRow(row) : null;
  },

  getItemContent(id) {
    const row = this.db.prepare("SELECT id, body, body_format FROM items WHERE id = ?").get(id);
    if (!row) throw new Error(`item not found: ${id}`);
    return { id: row.id, body: row.body, bodyFormat: row.body_format };
  },

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
  },

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
  },

  captureUrl(input = {}) {
    const sourceUrl = normalizeHttpUrl(input.sourceUrl ?? "");
    const title = nonEmpty(input.title) ?? new URL(sourceUrl).hostname;
    return saveUrl(this, {
      sourceUrl,
      title,
      description: "",
      body: "",
      metadata: {
        captureSource: String(input.captureSource ?? ""),
        pendingUrlCapture: {
          initialTitle: title,
          preserveTitle: Boolean(nonEmpty(input.title)),
        },
      },
    });
  },

  async saveFile(input = {}) {
    const fileName = sanitizeFileName(input.fileName);
    const id = validateItemId(input.id ?? randomUUID());
    const mimeType = nonEmpty(input.mimeType)?.toLowerCase() ?? null;
    const kind = normalizeFileKind(input.kind, mimeType, fileName);
    const bytes = fileInputBuffer(input.bytes);
    if (bytes.length > maxFileBytes)
      throw new Error("invalid storage input: file exceeds the 50 MB input limit");
    if (bytes.length === 0) throw new Error("invalid storage input: file bytes cannot be empty");
    // Header only: it refuses a non-image or oversized one and gives the card its
    // shape. Resizing is the image_thumbnail job's work, never capture's.
    const size = kind === "image" ? await this.inspectImage?.(bytes) : null;
    const itemDirectory = join(this.assetsDirectory, id);
    await mkdir(itemDirectory, { recursive: true });
    const originalPath = join(itemDirectory, fileName);
    await writeFile(originalPath, bytes);
    const metadata = {
      fileName,
      mimeType,
      byteLength: bytes.length,
      ...(size ? { mediaWidth: size.width, mediaHeight: size.height } : {}),
    };
    const now = nowMillis();
    const title = fileName;
    const existing = this.getItem(id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (existing) {
        this.db
          .prepare(`UPDATE items SET kind = ?, title = ?, description = NULL, body = '', body_format = 'md',
          source_label = ?, local_asset_path = ?, thumbnail_path = NULL, ocr_text = '', metadata = ?, archived = 0,
          updated_at = ? WHERE id = ?`)
          .run(
            kind,
            title,
            mimeType,
            relativeAssetPath(`items/${id}/${fileName}`),
            JSON.stringify(metadata),
            now,
            id,
          );
      } else {
        this.db
          .prepare(`INSERT INTO items (id, kind, title, body, body_format, source_label, local_asset_path,
          metadata, ocr_text, created_at, updated_at) VALUES (?, ?, ?, '', 'md', ?, ?, ?, '', ?, ?)`)
          .run(
            id,
            kind,
            title,
            mimeType,
            relativeAssetPath(`items/${id}/${fileName}`),
            JSON.stringify(metadata),
            now,
            now,
          );
      }
      if (kind === "image") {
        // The palette job reads the thumbnail, so the thumbnail job queues it.
        this.jobs.enqueue(id, IMAGE_THUMBNAIL_JOB, { notify: false });
        this.jobs.enqueue(id, "ocr_image", { notify: false });
      }
      if (kind === "pdf") this.jobs.enqueue(id, "ocr_pdf_page", { notify: false });
      // Queued ahead of the embedding so the card gets its poster before model loading.
      if (kind === "video") this.jobs.enqueue(id, VIDEO_POSTER_JOB, { notify: false });
      this.jobs.enqueue(id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.jobs.notify(id);
    return this.getItem(id);
  },

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
  },

  updateItem(input = {}) {
    let metadata = input.metadata;
    if (input.metadataPatch != null) {
      const current = this.getItem(input.id);
      if (!current) throw new Error(`item not found: ${input.id}`);
      metadata = {
        ...current.metadata,
        ...parseObject(input.metadataPatch, "metadata patch"),
      };
    }
    if (input.addTag != null) {
      const tag = String(input.addTag).trim().replace(/^#+/u, "").trim().toLowerCase();
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
      thumbnail_path = COALESCE(?, thumbnail_path), metadata = COALESCE(?, metadata),
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
      "metadataPatch",
      "addTag",
      "localAssetPath",
    ].some((key) => input[key] != null);
    if (shouldReembed) this.jobs.enqueue(input.id, "generate_embedding");
    return this.getItem(input.id);
  },

  archiveItem(id, archived = true) {
    const updated = this.db
      .prepare("UPDATE items SET archived = ?, updated_at = ? WHERE id = ?")
      .run(Number(Boolean(archived)), nowMillis(), id).changes;
    if (!updated) throw new Error(`item not found: ${id}`);
    return this.getItem(id);
  },

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
  },
};
