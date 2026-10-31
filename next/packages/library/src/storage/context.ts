import type { SqlClient } from "effect/sql/SqlClient";
import type { JobQueue } from "./jobs.ts";

/** A finished WebP card image and the oriented size of its source. */
export type Thumbnail = { bytes: Uint8Array; width?: number | null; height?: number | null };

export type StorageMedia = {
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
