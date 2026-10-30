import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Effect, Predicate } from "effect";
import type { StorageContext } from "./context.ts";
import { readItem } from "./rows.ts";
import { changes, nonEmpty, normalizeHttpUrl, parseJson } from "./shared.ts";
import { attempt, invalidInput, itemNotFound, storageFailure } from "./errors.ts";
import {
  IMAGE_PALETTE_JOB,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./jobs.ts";

export type UrlArticle = {
  canonicalUrl?: unknown;
  title?: unknown;
  text?: unknown;
  description?: unknown;
  html?: unknown;
  author?: unknown;
  publishedDate?: unknown;
  extractor?: unknown;
  imageUrls?: unknown;
  imageDimensions?: unknown;
  safeEmbeds?: unknown;
  social?: unknown;
};

type Candidate = { rowid: number; id: string };

const missingThumbnailCandidateSql = (kind: "pdf" | "video") => `SELECT rowid, id FROM items
  WHERE kind = '${kind}' AND rowid > ? AND thumbnail_path IS NULL AND local_asset_path != ''
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE item_id = items.id AND kind = ? AND status = 'failed')
  ORDER BY rowid LIMIT 1`;

// Exported so a test can check the query plan walks the kind index without sorting.
export const pdfThumbnailCandidateSql = missingThumbnailCandidateSql("pdf");
const videoPosterCandidateSql = missingThumbnailCandidateSql("video");

const imagePaletteCandidateSql = `SELECT rowid, id FROM items
  WHERE kind = 'image' AND thumbnail_path IS NOT NULL AND rowid > ?
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE item_id = items.id AND kind = ? AND status = 'failed')
  AND json_type(metadata, '$.palette') IS NULL
  ORDER BY rowid LIMIT 1`;

export function makeEnrichment(ctx: StorageContext) {
  const { sql, jobs } = ctx;
  const candidate = (query: string, afterRowid: number, kind: string) =>
    sql.unsafe<Candidate>(query, [afterRowid, kind]).pipe(Effect.map(([row]) => row));

  const storeOcrText = Effect.fnUntraced(function* (id: string, text: string, engine: string) {
    const [row] = yield* sql<{ metadata: string }>`SELECT metadata FROM items WHERE id = ${id}`;
    if (!row) return yield* itemNotFound(id);
    const parsed = parseJson<unknown>(row.metadata, {});
    const metadata = Predicate.isObject(parsed) ? parsed : {};
    delete metadata.ocrText;
    metadata.ocrEngine = engine;
    metadata.ocrCompletedAt = Date.now();
    // Leaves updated_at alone: the library sorts by it, and background OCR
    // finishing should not move a card the user did not touch.
    yield* sql`UPDATE items SET ocr_text = ${text}, metadata = ${JSON.stringify(metadata)}
      WHERE id = ${id}`;
  });

  const applyUrlEnrichment = Effect.fnUntraced(function* (
    jobId: string,
    workerId: string,
    article: UrlArticle = {},
  ) {
    const canonicalUrl = yield* normalizeHttpUrl(article.canonicalUrl ?? "");
    const articleTitle = nonEmpty(article.title);
    const text = nonEmpty(article.text) ?? "";
    const description = nonEmpty(article.description) ?? (text ? text.slice(0, 180) : null);
    const html = nonEmpty(article.html);
    const author = nonEmpty(article.author);
    const publishedDate = nonEmpty(article.publishedDate);
    const extractor = nonEmpty(article.extractor);
    const sourceLabel = new URL(canonicalUrl).hostname;

    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const [job] = yield* sql<{ item_id: string }>`SELECT item_id FROM jobs WHERE id = ${jobId}
          AND kind = ${URL_ENRICHMENT_JOB} AND status = 'processing' AND worker_id = ${workerId}`;
        if (!job) return false;
        const item = yield* readItem(ctx, job.item_id);
        if (!item) return false;

        const metadata = { ...item.metadata };
        const pending = metadata.pendingUrlCapture;
        const shouldUseArticleTitle =
          Predicate.isObject(pending) &&
          pending.preserveTitle !== true &&
          item.title === pending.initialTitle;
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
        for (const key of ["imageUrls", "imageDimensions", "safeEmbeds"] as const) {
          const values = article[key];
          if (Array.isArray(values) && values.length > 0) metadata[key] = values;
        }
        if (article.social) metadata.social = article.social;

        yield* sql`UPDATE items SET
          title = ${shouldUseArticleTitle ? (articleTitle ?? item.title) : item.title},
          description = ${nonEmpty(item.description) ? item.description : description},
          source_url = ${canonicalUrl}, source_label = ${sourceLabel},
          metadata = ${JSON.stringify(metadata)}, updated_at = ${Date.now()}
          WHERE id = ${item.id}`;
        yield* jobs.enqueue(item.id, "generate_embedding");
        return true;
      }),
    );
  });

  // Kinds whose thumbnail is rendered after capture, so the stored row may still
  // be waiting for one. An existing thumbnail is never replaced.
  const storeDerivedThumbnail = Effect.fnUntraced(function* (
    id: string,
    kind: string,
    png: Buffer,
    recordSize = false,
  ) {
    const pending = sql`SELECT 1 FROM items WHERE id = ${id} AND kind = ${kind}
      AND thumbnail_path IS NULL`.pipe(Effect.map((rows) => rows.length > 0));
    if (!(yield* pending)) return false;
    const createThumbnail = ctx.media.createThumbnail;
    if (!createThumbnail) return yield* storageFailure("image thumbnail generation is unavailable");
    const thumbnail = yield* attempt(() => createThumbnail(png));
    return yield* Effect.acquireUseRelease(
      attempt(() => mkdtemp(join(dirname(ctx.databasePath), ".inkling-thumbnail-"))),
      Effect.fnUntraced(function* (staging) {
        const staged = join(staging, "thumbnail.webp");
        yield* attempt(() => writeFile(staged, thumbnail.bytes));
        if (!(yield* pending)) return false;
        yield* attempt(() => rename(staged, join(ctx.assetsDirectory, id, "thumbnail.webp")));
        const updated = yield* sql`UPDATE items SET
          thumbnail_path = ${`assets/items/${id}/thumbnail.webp`},
          metadata = CASE WHEN ${Number(recordSize)}
            THEN json_set(metadata, '$.mediaWidth', ${thumbnail.width ?? null},
              '$.mediaHeight', ${thumbnail.height ?? null})
            ELSE metadata END
          WHERE id = ${id} AND kind = ${kind} AND thumbnail_path IS NULL`.raw;
        if (changes(updated)) yield* jobs.notify(id);
        return changes(updated) > 0;
      }),
      (staging) => attempt(() => rm(staging, { recursive: true, force: true })).pipe(Effect.ignore),
    );
  });

  const storeImagePalette = Effect.fnUntraced(function* (id: string, palette: unknown) {
    if (
      !Array.isArray(palette) ||
      palette.length !== 5 ||
      palette.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
    ) {
      return yield* invalidInput("image palette must contain five hex colors");
    }
    const item = yield* readItem(ctx, id);
    if (item?.kind !== "image") return false;
    const metadata = JSON.stringify({ ...item.metadata, palette });
    const updated = yield* sql`UPDATE items SET metadata = ${metadata}
      WHERE id = ${id} AND kind = 'image'`.raw;
    if (changes(updated)) yield* jobs.notify(id);
    return changes(updated) > 0;
  });

  return {
    storeOcrText,
    applyUrlEnrichment,
    nextPdfThumbnailCandidate: (afterRowid: number) =>
      candidate(pdfThumbnailCandidateSql, afterRowid, PDF_THUMBNAIL_JOB),
    nextVideoPosterCandidate: (afterRowid: number) =>
      candidate(videoPosterCandidateSql, afterRowid, VIDEO_POSTER_JOB),
    nextImagePaletteCandidate: (afterRowid: number) =>
      candidate(imagePaletteCandidateSql, afterRowid, IMAGE_PALETTE_JOB),
    storePdfThumbnail: (id: string, png: Buffer) => storeDerivedThumbnail(id, "pdf", png),
    storeVideoPoster: (id: string, png: Buffer) => storeDerivedThumbnail(id, "video", png),
    // The decoded size also lands in the metadata: BMP and ICO captures have no
    // header-only size, and an EXIF-rotated photo needs its oriented one.
    storeImageThumbnail: (id: string, bytes: Buffer) =>
      storeDerivedThumbnail(id, "image", bytes, true),
    storeImagePalette,
  };
}
