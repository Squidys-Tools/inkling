import { Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";
import type { Fragment } from "effect/sql/Statement";
import type { JobQueue } from "./jobs.ts";
import { cardFromRow, detailColumns, type ItemRow, itemColumns, itemFromRow } from "./shared.ts";

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
  sql<ItemRow>`SELECT ${sql.literal(itemColumns)} FROM items WHERE ${where}
    ORDER BY updated_at DESC, created_at DESC ${limit == null ? sql.literal("") : sql`LIMIT ${limit}`}`.pipe(
    Effect.map((rows) => rows.map(cardFromRow)),
  );

export const readItem = ({ sql }: StorageContext, id: string) =>
  sql<ItemRow>`SELECT ${sql.literal(detailColumns)} FROM items WHERE id = ${id}`.pipe(
    Effect.map(([row]) => (row ? itemFromRow(row) : null)),
  );
