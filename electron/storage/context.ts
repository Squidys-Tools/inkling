import { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { Fragment } from "effect/sql/Statement";
import type { JobQueue } from "./jobs.ts";
import {
  cardColumns,
  cardFromRow,
  type ItemContent,
  type ItemRow,
  itemFromRow,
  qualifiedDetailColumns,
} from "./shared.ts";

type Thumbnail = { bytes: Uint8Array; width?: number | null; height?: number | null };

export type StorageMedia = {
  createThumbnail?: (bytes: Buffer) => Promise<Thumbnail>;
  inspectImage?: (
    bytes: Buffer,
  ) => Promise<{ width: number | undefined; height: number | undefined } | null | undefined>;
  createSnapshot?: (source: string, destination: string) => Promise<void>;
};

export type StorageContext = {
  sql: SqlClient;
  jobs: JobQueue["Service"];
  databasePath: string;
  assetsRoot: string;
  assetsDirectory: string;
  fts5Enabled: boolean;
  media: StorageMedia;
};

export const selectCards = (
  { sql }: StorageContext,
  where: Fragment,
  limit: number | null = null,
) =>
  sql<ItemRow>`SELECT ${sql.literal(cardColumns)} FROM items WHERE ${where}
    ORDER BY updated_at DESC, created_at DESC ${limit == null ? sql.literal("") : sql`LIMIT ${limit}`}`.pipe(
    Effect.map((rows) => rows.map(cardFromRow)),
  );

export const readItem = ({ sql }: StorageContext, id: string) =>
  sql<ItemRow>`SELECT ${sql.literal(qualifiedDetailColumns)}, c.html AS content_html,
    c.text AS content_text, c.extracted_text AS content_extracted_text
    FROM items i LEFT JOIN item_content c ON c.item_id = i.id WHERE i.id = ${id}`.pipe(
    Effect.map(([row]) => (row ? itemFromRow(row) : null)),
  );

// Detail reads surface content keys inside metadata, so writers route the same
// keys back here. An all-empty payload deletes the row: no content, no marker.
export const syncItemContent = ({ sql }: StorageContext, id: string, content: ItemContent) =>
  content.html == null && content.text == null && content.extracted_text == null
    ? sql`DELETE FROM item_content WHERE item_id = ${id}`
    : sql`INSERT INTO item_content (item_id, html, text, extracted_text)
        VALUES (${id}, ${content.html}, ${content.text}, ${content.extracted_text})
        ON CONFLICT(item_id) DO UPDATE SET html = excluded.html, text = excluded.text,
          extracted_text = excluded.extracted_text
        WHERE excluded.html IS NOT item_content.html OR excluded.text IS NOT item_content.text
          OR excluded.extracted_text IS NOT item_content.extracted_text`;
