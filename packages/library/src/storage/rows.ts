import { Effect, Option, Predicate, Schema } from "effect";
import type { Fragment } from "effect/sql/Statement";
import type { LibraryCard, ItemDetail } from "@inkling/contracts";
import type { StorageContext } from "./context.ts";
import { invalidInput, itemNotFound } from "./errors.ts";
import { type Metadata, parseJson } from "./shared.ts";

export type ItemRow = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  body: string | null;
  body_format: string | null;
  source_url: string | null;
  source_label: string | null;
  local_asset_path: string | null;
  thumbnail_path: string | null;
  ocr_text: string;
  metadata: string;
  created_at: number;
  updated_at: number;
  archived: number;
};

export const itemColumns = `id, kind, title, description, source_url, source_label,
  local_asset_path, thumbnail_path, ocr_text, metadata, created_at, updated_at,
  archived, NULL AS body, 'md' AS body_format`;
const detailColumns = itemColumns.replace("NULL AS body, 'md' AS body_format", "body, body_format");
export const qualifiedItemColumns = `i.id, i.kind, i.title, i.description, i.source_url, i.source_label,
  i.local_asset_path, i.thumbnail_path, i.ocr_text, i.metadata, i.created_at, i.updated_at,
  i.archived, NULL AS body, 'md' AS body_format`;
const cardMetadataFields = [
  "tags",
  "social",
  "imageUrls",
  "imageDimensions",
  "mediaWidth",
  "mediaHeight",
  "mediaAspectRatio",
  "pdfPageCount",
];

export function itemFromRow(row: ItemRow): ItemDetail {
  const metadata = parseJson<unknown>(row.metadata, {});
  const fields = Predicate.isObject(metadata) ? metadata : {};
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    body: row.body ?? "",
    bodyFormat: row.body_format ?? "md",
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    localAssetPath: row.local_asset_path,
    thumbnailPath: row.thumbnail_path,
    ocrText: row.ocr_text,
    metadata: fields,
    palette: Array.isArray(fields.palette) ? fields.palette : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archived: row.archived !== 0,
  };
}

export function cardItem(item: ItemDetail): LibraryCard {
  const metadata = item.metadata;
  const cardMetadata: Metadata = {};
  for (const field of cardMetadataFields) {
    if (Object.hasOwn(metadata, field)) cardMetadata[field] = metadata[field];
  }
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.description,
    sourceUrl: item.sourceUrl,
    sourceLabel: item.sourceLabel,
    localAssetPath: item.localAssetPath,
    thumbnailPath: item.thumbnailPath,
    palette: Array.isArray(metadata.palette) ? metadata.palette : undefined,
    ocrText: String(item.ocrText ?? "")
      .trim()
      .slice(0, 180),
    metadata: cardMetadata,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    archived: item.archived,
    hasArticleContent: typeof metadata.html === "string" && Boolean(metadata.html.trim()),
  };
}

export const cardFromRow = (row: ItemRow) => cardItem(itemFromRow(row));

export const selectCards = (
  { sql }: StorageContext,
  where: Fragment,
  limit: number | null = null,
) =>
  sql<ItemRow>`SELECT ${sql.literal(itemColumns)} FROM items WHERE ${where}
    ORDER BY updated_at DESC, created_at DESC ${limit == null ? sql.literal("") : sql`LIMIT ${limit}`}`.pipe(
    Effect.map((rows) => rows.map(cardFromRow)),
  );

// The renderer hands cursors back verbatim, but one from an older build or a
// corrupted state must fail as a message, not a defect.
export const readCursor = <A>(
  decode: (input: unknown) => Option.Option<A>,
  cursor: string | null,
) =>
  cursor == null
    ? Effect.succeed(null)
    : Option.match(decode(cursor), {
        onNone: () =>
          Effect.fail(invalidInput("the page cursor is not valid; load the list from the top")),
        onSome: (after) => Effect.succeed(after),
      });

// Keyset paging: the cursor is the last card's sort key, so a page costs the
// same at item 9,000 as at item 0 and an insert never shifts the next page.
const CardCursor = Schema.Tuple([Schema.Finite, Schema.Finite, Schema.String]);
const decodeCardCursor = Schema.decodeUnknownOption(Schema.fromJsonString(CardCursor));

export const pageCards = Effect.fnUntraced(function* (
  { sql }: StorageContext,
  where: Fragment,
  cursor: string | null,
  limit: number,
) {
  const after = yield* readCursor(decodeCardCursor, cursor);
  const rows = yield* sql<ItemRow>`SELECT ${sql.literal(itemColumns)} FROM items WHERE ${where}
    ${after ? sql`AND (updated_at, created_at, id) < (${after[0]}, ${after[1]}, ${after[2]})` : sql.literal("")}
    ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT ${limit + 1}`;
  const [{ total }] = yield* sql<{
    total: number;
  }>`SELECT COUNT(*) AS total FROM items WHERE ${where}`;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    cards: page.map(cardFromRow),
    next:
      rows.length > limit && last
        ? JSON.stringify([
            last.updated_at,
            last.created_at,
            last.id,
          ] satisfies typeof CardCursor.Type)
        : null,
    total,
  };
});

export const readItem = ({ sql }: StorageContext, id: string) =>
  sql<ItemRow>`SELECT ${sql.literal(detailColumns)} FROM items WHERE id = ${id}`.pipe(
    Effect.map(([row]) => (row ? itemFromRow(row) : null)),
  );

// A write reads its row back; losing it in between is a failure, not an empty result.
export const writtenItem = (ctx: StorageContext, id: string) =>
  readItem(ctx, id).pipe(
    Effect.flatMap((item) => (item ? Effect.succeed(item) : Effect.fail(itemNotFound(id)))),
  );
