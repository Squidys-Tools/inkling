import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  IMAGE_PALETTE_JOB,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./jobs.mjs";
import { nonEmpty, normalizeHttpUrl, nowMillis, parseJson } from "./shared.mjs";

export const enrichmentMethods = {
  storeOcrText(id, text, engine) {
    const row = this.db.prepare("SELECT metadata FROM items WHERE id = ?").get(id);
    if (!row) throw new Error(`item not found: ${id}`);
    const metadata = parseJson(row.metadata, {});
    const ocrMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
    delete ocrMetadata.ocrText;
    ocrMetadata.ocrEngine = String(engine);
    ocrMetadata.ocrCompletedAt = nowMillis();
    // Leaves updated_at alone: the library sorts by it, and background OCR
    // finishing should not move a card the user did not touch.
    this.db
      .prepare("UPDATE items SET ocr_text = ?, metadata = ? WHERE id = ?")
      .run(String(text), JSON.stringify(ocrMetadata), id);
  },

  applyUrlEnrichment(jobId, workerId, article = {}) {
    const canonicalUrl = normalizeHttpUrl(article.canonicalUrl ?? "");
    const articleTitle = nonEmpty(article.title);
    const text = nonEmpty(article.text) ?? "";
    const description = nonEmpty(article.description) ?? (text ? text.slice(0, 180) : null);
    const html = nonEmpty(article.html);
    const author = nonEmpty(article.author);
    const publishedDate = nonEmpty(article.publishedDate);
    const extractor = nonEmpty(article.extractor);
    const sourceLabel = new URL(canonicalUrl).hostname;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const job = this.db
        .prepare(`SELECT item_id FROM jobs WHERE id = ? AND kind = ?
        AND status = 'processing' AND worker_id = ?`)
        .get(jobId, URL_ENRICHMENT_JOB, workerId);
      if (!job) {
        this.db.exec("COMMIT");
        return false;
      }

      const item = this.getItem(job.item_id);
      if (!item) {
        this.db.exec("COMMIT");
        return false;
      }

      const metadata = { ...item.metadata };
      const pendingCapture = metadata.pendingUrlCapture;
      const shouldUseArticleTitle =
        pendingCapture &&
        typeof pendingCapture === "object" &&
        !Array.isArray(pendingCapture) &&
        pendingCapture.preserveTitle !== true &&
        item.title === pendingCapture.initialTitle;
      delete metadata.pendingUrlCapture;
      metadata.sourceUrl = canonicalUrl;
      if (text) {
        metadata.text = text;
        metadata.extractedText = text;
      }
      if (html) metadata.html = html;
      if (author) metadata.author = author;
      if (publishedDate) metadata.publishedDate = publishedDate;
      if (extractor) metadata.extractor = extractor;
      if (Array.isArray(article.imageUrls) && article.imageUrls.length > 0)
        metadata.imageUrls = article.imageUrls;
      if (Array.isArray(article.imageDimensions) && article.imageDimensions.length > 0)
        metadata.imageDimensions = article.imageDimensions;
      if (Array.isArray(article.safeEmbeds) && article.safeEmbeds.length > 0)
        metadata.safeEmbeds = article.safeEmbeds;
      if (article.social) metadata.social = article.social;

      this.db
        .prepare(`UPDATE items SET title = ?, description = ?, source_url = ?, source_label = ?,
        metadata = ?, updated_at = ? WHERE id = ?`)
        .run(
          shouldUseArticleTitle ? (articleTitle ?? item.title) : item.title,
          nonEmpty(item.description) ? item.description : description,
          canonicalUrl,
          sourceLabel,
          JSON.stringify(metadata),
          nowMillis(),
          item.id,
        );
      this.jobs.enqueue(item.id, "generate_embedding", { notify: false });
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  },

  nextPdfThumbnailCandidate(afterRowid) {
    return this.db
      .prepare(`SELECT rowid, id FROM items
        WHERE kind = 'pdf' AND rowid > ? AND thumbnail_path IS NULL AND local_asset_path != ''
        AND NOT EXISTS (SELECT 1 FROM jobs WHERE item_id = items.id AND kind = ? AND status = 'failed')
        ORDER BY rowid LIMIT 1`)
      .get(afterRowid, PDF_THUMBNAIL_JOB);
  },

  nextVideoPosterCandidate(afterRowid) {
    return this.db
      .prepare(`SELECT rowid, id FROM items
        WHERE kind = 'video' AND rowid > ? AND thumbnail_path IS NULL AND local_asset_path != ''
        AND NOT EXISTS (SELECT 1 FROM jobs WHERE item_id = items.id AND kind = ? AND status = 'failed')
        ORDER BY rowid LIMIT 1`)
      .get(afterRowid, VIDEO_POSTER_JOB);
  },

  storePdfThumbnail(id, png) {
    return this.storeDerivedThumbnail(id, "pdf", png);
  },

  storeVideoPoster(id, png) {
    return this.storeDerivedThumbnail(id, "video", png);
  },

  // The decoded size also lands in the metadata: BMP and ICO captures have no
  // header-only size, and an EXIF-rotated photo needs its oriented one.
  storeImageThumbnail(id, bytes) {
    return this.storeDerivedThumbnail(id, "image", bytes, { recordSize: true });
  },

  // Kinds whose thumbnail is rendered after capture, so the stored row may still
  // be waiting for one. An existing thumbnail is never replaced.
  async storeDerivedThumbnail(id, kind, png, { recordSize = false } = {}) {
    const pending = () =>
      this.db
        .prepare("SELECT 1 FROM items WHERE id = ? AND kind = ? AND thumbnail_path IS NULL")
        .get(id, kind);
    if (!pending()) return false;
    if (!this.createThumbnail) throw new Error("image thumbnail generation is unavailable");
    const thumbnail = await this.createThumbnail(png);
    const staging = await mkdtemp(join(dirname(this.databasePath), ".inkling-thumbnail-"));
    try {
      const staged = join(staging, "thumbnail.webp");
      await writeFile(staged, thumbnail.bytes);
      const thumbnailPath = `assets/items/${id}/thumbnail.webp`;
      if (!pending()) return false;
      await rename(staged, join(this.assetsDirectory, id, "thumbnail.webp"));
      const updated = this.db
        .prepare(`UPDATE items SET thumbnail_path = ?,
          metadata = CASE WHEN ? THEN json_set(metadata, '$.mediaWidth', ?, '$.mediaHeight', ?)
            ELSE metadata END
          WHERE id = ? AND kind = ? AND thumbnail_path IS NULL`)
        .run(
          thumbnailPath,
          Number(recordSize),
          thumbnail.width ?? null,
          thumbnail.height ?? null,
          id,
          kind,
        ).changes;
      if (updated) this.jobs.notify(id);
      return updated > 0;
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  },

  nextImagePaletteCandidate(afterRowid) {
    return this.db
      .prepare(`SELECT rowid, id FROM items
        WHERE kind = 'image' AND thumbnail_path IS NOT NULL AND rowid > ?
        AND NOT EXISTS (SELECT 1 FROM jobs WHERE item_id = items.id AND kind = ? AND status = 'failed')
        AND json_type(metadata, '$.palette') IS NULL
        ORDER BY rowid LIMIT 1`)
      .get(afterRowid, IMAGE_PALETTE_JOB);
  },

  storeImagePalette(id, palette) {
    if (
      !Array.isArray(palette) ||
      palette.length !== 5 ||
      palette.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    ) {
      throw new Error("invalid storage input: image palette must contain five hex colors");
    }
    const item = this.getItem(id);
    if (item?.kind !== "image") return false;
    const metadata = { ...item.metadata, palette };
    const updated = this.db
      .prepare("UPDATE items SET metadata = ? WHERE id = ? AND kind = 'image'")
      .run(JSON.stringify(metadata), id).changes;
    if (updated) this.jobs.notify(id);
    return updated > 0;
  },
};
