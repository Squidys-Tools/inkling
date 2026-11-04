import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import type { LibraryStatus } from "@inkling/contracts";
import type { StorageContext, StorageMedia } from "./context.ts";
import { makeEnrichment } from "./enrichment.ts";
import { makeExport } from "./export-library.ts";
import { makeFiles } from "./files.ts";
import { makeImport } from "./import-library.ts";
import { makeItems } from "./items.ts";
import { makePhotoSearch } from "./photo-search.ts";
import { JobQueue, type JobQueueOptions, makeJobQueue } from "./jobs.ts";
import { openDatabase, SCHEMA_VERSION } from "./schema.ts";
import { makeSearch } from "./search.ts";
import { makeSpaces } from "./spaces.ts";

export type LibraryOptions = {
  databasePath: string;
  // Recorded in export manifests; main passes the running build's version.
  appVersion: string;
  media?: StorageMedia;
  jobQueue?: JobQueueOptions;
  // Tests turn FTS off to cover the LIKE fallback on SQLite builds without FTS5.
  useFts5?: boolean;
  // Tests turn this off: nothing they check must survive a power cut, and a commit's
  // disk sync costs about 100ms on CI disks.
  syncToDisk?: boolean;
};

const makeLibrary = Effect.fnUntraced(function* (
  databasePath: string,
  appVersion: string,
  fts5Enabled: boolean,
  media: StorageMedia,
) {
  const sql = yield* SqlClient.SqlClient;
  const jobs = yield* JobQueue;
  const assetsRoot = join(dirname(databasePath), "assets");
  const ctx: StorageContext = {
    sql,
    jobs,
    databasePath,
    appVersion,
    assetsRoot,
    assetsDirectory: join(assetsRoot, "items"),
    fts5Enabled,
    media,
  };
  const search = makeSearch(ctx);
  return {
    status: (): Omit<LibraryStatus, "itemCount"> => ({
      databasePath,
      fts5Enabled,
      schemaVersion: SCHEMA_VERSION,
    }),
    hasCompletedOnboarding: () =>
      sql`SELECT 1 FROM app_settings WHERE key = 'onboarding_completed'`.pipe(
        Effect.map((rows) => rows.length > 0),
      ),
    completeOnboarding: () =>
      sql`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('onboarding_completed', '1')`.pipe(
        Effect.as(undefined),
      ),
    ...makeItems(ctx),
    ...makeFiles(ctx),
    ...makeEnrichment(ctx),
    ...search,
    ...makePhotoSearch(ctx),
    ...makeSpaces(ctx, search),
    ...makeExport(ctx),
    ...makeImport(ctx),
  };
});

export class Library extends Context.Service<
  Library,
  Effect.Success<ReturnType<typeof makeLibrary>>
>()("inkling/storage/Library") {}

const clientLayer = (filename: string, syncToDisk: boolean) => {
  const client = SqliteClient.layer({ filename, disableWAL: true });
  if (syncToDisk) return client;
  // The client holds one connection, so the pragma covers every query it runs.
  const skipSyncs = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`PRAGMA synchronous = OFF`;
    }),
  );
  return skipSyncs.pipe(Layer.provideMerge(client));
};

// Migrations need multi-statement DDL, which the Effect client cannot run, so
// they finish on a plain connection before the client opens the file.
export function libraryLayer({
  media = {},
  jobQueue,
  useFts5,
  appVersion,
  syncToDisk = true,
  ...options
}: LibraryOptions) {
  const databasePath = resolve(options.databasePath);
  return Layer.unwrap(
    Effect.try({
      try: () => {
        mkdirSync(dirname(databasePath), { recursive: true });
        const { db, fts5Enabled } = openDatabase(databasePath, { syncToDisk });
        db.close();
        return fts5Enabled;
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.map((fts5Enabled) =>
        Layer.effect(
          Library,
          makeLibrary(databasePath, appVersion, fts5Enabled && useFts5 !== false, media),
        ).pipe(
          Layer.provideMerge(Layer.effect(JobQueue, makeJobQueue(jobQueue))),
          Layer.provideMerge(clientLayer(databasePath, syncToDisk)),
        ),
      ),
    ),
  );
}
