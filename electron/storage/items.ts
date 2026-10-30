import { randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect } from "effect";
import type {
  CaptureUrlInput,
  CreateNoteInput,
  CreateQuoteInput,
  UpdateItemInput,
} from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { readItem, selectCards, writtenItem } from "./rows.ts";
import {
  changes,
  isMissing,
  isSafeItemId,
  markdownToPlainText,
  type Metadata,
  nonEmpty,
  normalizeHttpUrl,
} from "./shared.ts";
import { attempt, invalidInput, itemNotFound } from "./errors.ts";
import { URL_ENRICHMENT_JOB } from "./jobs.ts";

export function makeItems(ctx: StorageContext) {
  const { sql, jobs } = ctx;
  const getItem = (id: string) => readItem(ctx, id);

  const createNote = Effect.fnUntraced(function* (input: CreateNoteInput) {
    const body = input.body.trim();
    if (!body) return yield* invalidInput("note body cannot be empty");
    const id = randomUUID();
    const now = Date.now();
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO items (id, kind, title, description, body, body_format, metadata,
          ocr_text, created_at, updated_at)
          VALUES (${id}, 'note', ${nonEmpty(input.title)}, ${markdownToPlainText(body)}, ${body}, 'md',
          ${JSON.stringify(input.metadata ?? {})}, '', ${now}, ${now})`;
        yield* jobs.enqueue(id, "generate_embedding");
      }),
    );
    return yield* writtenItem(ctx, id);
  });

  const createQuote = Effect.fnUntraced(function* (input: CreateQuoteInput) {
    const body = input.body.trim();
    if (!body) return yield* invalidInput("quote text cannot be empty");
    if (body.length > 2000)
      return yield* invalidInput("quote text must be at most 2000 characters");
    const attribution = nonEmpty(input.attribution);
    if (attribution && attribution.length > 240)
      return yield* invalidInput("quote attribution must be at most 240 characters");
    const sourceUrl = nonEmpty(input.sourceUrl) ? yield* normalizeHttpUrl(input.sourceUrl) : null;
    const sourceLabel = sourceUrl
      ? new URL(sourceUrl).hostname
      : attribution?.split(",")[0].trim() || null;
    const metadata: Metadata = { ...input.metadata };
    metadata.quoteText = body;
    if (attribution) metadata.attribution = attribution;
    if (sourceUrl) metadata.sourceUrl = sourceUrl;
    metadata.text = attribution ? `${body}\n\n${attribution}` : body;
    const id = randomUUID();
    const now = Date.now();
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO items (id, kind, title, description, body, body_format, source_url,
          source_label, metadata, ocr_text, created_at, updated_at)
          VALUES (${id}, 'quote', ${body}, ${attribution}, '', '', ${sourceUrl}, ${sourceLabel},
          ${JSON.stringify(metadata)}, '', ${now}, ${now})`;
        yield* jobs.enqueue(id, "generate_embedding");
      }),
    );
    return yield* writtenItem(ctx, id);
  });

  const captureUrl = Effect.fnUntraced(function* (input: CaptureUrlInput) {
    const sourceUrl = yield* normalizeHttpUrl(input.sourceUrl);
    const sourceLabel = new URL(sourceUrl).hostname;
    const title = nonEmpty(input.title) ?? sourceLabel;
    const metadata = {
      captureSource: input.captureSource ?? "",
      pendingUrlCapture: { initialTitle: title, preserveTitle: Boolean(nonEmpty(input.title)) },
      sourceUrl,
      text: "",
      imageUrls: [],
      imageDimensions: [],
      safeEmbeds: [],
      html: "",
    };
    const id = randomUUID();
    const now = Date.now();
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* sql`INSERT INTO items (id, kind, title, description, body, body_format, source_url,
          source_label, metadata, ocr_text, created_at, updated_at)
          VALUES (${id}, 'url', ${title}, NULL, '', '', ${sourceUrl}, ${sourceLabel},
          ${JSON.stringify(metadata)}, '', ${now}, ${now})`;
        yield* jobs.enqueue(id, URL_ENRICHMENT_JOB);
      }),
    );
    return yield* writtenItem(ctx, id);
  });

  const updateItem = Effect.fnUntraced(function* (input: UpdateItemInput) {
    let metadata: Metadata | undefined = input.metadata;
    if (input.metadataPatch != null) {
      const current = yield* getItem(input.id);
      if (!current) return yield* itemNotFound(input.id);
      metadata = { ...current.metadata, ...input.metadataPatch };
    }
    if (input.addTag != null) {
      const tag = input.addTag.trim().replace(/^#+/u, "").trim().toLowerCase();
      if (!tag) return yield* invalidInput("tag cannot be empty");
      const base = metadata ?? (yield* getItem(input.id))?.metadata;
      if (!base) return yield* itemNotFound(input.id);
      const tagged = { ...base };
      if (tagged.tags == null) tagged.tags = [];
      if (!Array.isArray(tagged.tags))
        return yield* invalidInput("metadata tags must be an array to add a tag");
      if (!tagged.tags.some((value) => typeof value === "string" && value.toLowerCase() === tag))
        tagged.tags = [...tagged.tags, tag];
      metadata = tagged;
    }
    const body = input.body == null ? null : input.body.trim();
    if (body != null && !body) return yield* invalidInput("body cannot be empty");
    let bodyFormat = body == null ? null : "md";
    if (input.bodyFormat != null) {
      const requested = input.bodyFormat.trim().toLowerCase();
      if (requested && requested !== "md") return yield* invalidInput("bodyFormat must be 'md'");
      bodyFormat = "md";
    }
    const description =
      input.description == null
        ? body == null
          ? null
          : markdownToPlainText(body)
        : input.description.trim();
    const sourceUrl = input.sourceUrl == null ? null : yield* normalizeHttpUrl(input.sourceUrl);
    const updated = yield* sql`UPDATE items SET
      title = COALESCE(${input.title == null ? null : input.title.trim()}, title),
      description = COALESCE(${description}, description), body = COALESCE(${body}, body),
      body_format = COALESCE(${bodyFormat}, body_format),
      source_url = COALESCE(${sourceUrl}, source_url),
      source_label = COALESCE(${input.sourceLabel ?? null}, source_label),
      local_asset_path = COALESCE(${input.localAssetPath ?? null}, local_asset_path),
      thumbnail_path = COALESCE(${input.thumbnailPath ?? null}, thumbnail_path),
      metadata = COALESCE(${metadata == null ? null : JSON.stringify(metadata)}, metadata),
      updated_at = ${Date.now()} WHERE id = ${input.id}`.raw;
    if (!changes(updated)) return yield* itemNotFound(input.id);
    const shouldReembed = (
      [
        "title",
        "description",
        "body",
        "bodyFormat",
        "metadata",
        "metadataPatch",
        "addTag",
        "localAssetPath",
      ] as const
    ).some((key) => input[key] != null);
    if (shouldReembed) yield* jobs.enqueue(input.id, "generate_embedding");
    return yield* writtenItem(ctx, input.id);
  });

  const archiveItem = Effect.fnUntraced(function* (id: string, archived = true) {
    const updated = yield* sql`UPDATE items SET archived = ${Number(archived)},
      updated_at = ${Date.now()} WHERE id = ${id}`.raw;
    if (!changes(updated)) return yield* itemNotFound(id);
    return yield* writtenItem(ctx, id);
  });

  const deleteItem = Effect.fnUntraced(function* (id: string) {
    const [row] = yield* sql`SELECT id FROM items WHERE id = ${id} AND archived = 1`;
    if (!row) return yield* itemNotFound(id);
    const assetDirectory = join(ctx.assetsDirectory, id);
    let pendingRemoval: string | undefined;
    if (isSafeItemId(id)) {
      const target = `${assetDirectory}.delete-${randomUUID()}`;
      pendingRemoval = yield* attempt(() => rename(assetDirectory, target)).pipe(
        Effect.as<string | undefined>(target),
        Effect.catchIf(isMissing, () => Effect.succeed(undefined)),
      );
    }
    const removal = pendingRemoval;
    yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const deleted = yield* sql`DELETE FROM items WHERE id = ${id} AND archived = 1`.raw;
          if (!changes(deleted)) return yield* itemNotFound(id);
          yield* sql`DELETE FROM space_items WHERE item_id = ${id}`;
        }),
      )
      .pipe(
        Effect.tapError(() =>
          removal
            ? attempt(() => rename(removal, assetDirectory)).pipe(Effect.ignore)
            : Effect.void,
        ),
      );
    if (removal) yield* attempt(() => rm(removal, { recursive: true, force: true }));
  });

  return {
    listActiveItems: () => selectCards(ctx, sql`archived = 0`),
    listArchivedItems: () => selectCards(ctx, sql`archived = 1`),
    // Active items only, so an archived or deleted id is simply absent from the
    // result. The ids go in as one JSON value to stay under SQLite's parameter limit.
    getItemCards: (ids: ReadonlyArray<string>) =>
      ids.length === 0
        ? Effect.succeed([])
        : selectCards(
            ctx,
            sql`archived = 0 AND id IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`,
          ),
    getItem,
    getItemContent: Effect.fnUntraced(function* (id: string) {
      const [row] = yield* sql<{ id: string; body: string; body_format: string }>`SELECT id, body,
        body_format FROM items WHERE id = ${id}`;
      if (!row) return yield* itemNotFound(id);
      return { id: row.id, body: row.body, bodyFormat: row.body_format };
    }),
    createNote,
    createQuote,
    captureUrl,
    updateItem,
    archiveItem,
    deleteItem,
  };
}
