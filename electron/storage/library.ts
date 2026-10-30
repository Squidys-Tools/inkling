import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import type { StorageStatus } from "@inkling/contracts";
import type { StorageContext, StorageMedia } from "./context.ts";
import { makeEnrichment } from "./enrichment.ts";
import { makeExport } from "./export-library.ts";
import { makeImport } from "./import-library.ts";
import { makeItems } from "./items.ts";
import { JobQueue, type JobQueueOptions, makeJobQueue } from "./jobs.ts";
import { toError } from "./errors.ts";
import { openDatabase, SCHEMA_VERSION } from "./schema.ts";
import { makeSearch } from "./search.ts";
import { makeSpaces } from "./spaces.ts";

export {
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  JOB_LEASE_MILLIS,
  JobQueue,
  PDF_THUMBNAIL_JOB,
  URL_ENRICHMENT_JOB,
  VIDEO_POSTER_JOB,
} from "./jobs.ts";
export { markdownToPlainText } from "./shared.ts";

export function resolveLibraryDataDirectory({
  executablePath,
  appDataDirectory,
  portable = false,
  overrideDirectory,
}: {
  executablePath: string;
  appDataDirectory: string;
  portable?: boolean;
  overrideDirectory?: string | null;
}) {
  if (portable) return join(dirname(executablePath), "data");
  if (overrideDirectory) return resolve(overrideDirectory);
  return join(appDataDirectory, "com.inkling.library");
}

export type LibraryOptions = {
  databasePath: string;
  media?: StorageMedia;
  jobQueue?: JobQueueOptions;
  // Tests turn FTS off to cover the LIKE fallback on SQLite builds without FTS5.
  useFts5?: boolean;
};

const makeLibrary = Effect.fnUntraced(function* (
  databasePath: string,
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
    assetsRoot,
    assetsDirectory: join(assetsRoot, "items"),
    fts5Enabled,
    media,
  };
  const search = makeSearch(ctx);
  return {
    status: (): StorageStatus => ({ databasePath, fts5Enabled, schemaVersion: SCHEMA_VERSION }),
    // Rows written through this connection since it opened. The main process is
    // the only writer, so an unchanged count means the library has not changed.
    changeCount: () =>
      sql<{ changes: number }>`SELECT total_changes() AS changes`.pipe(
        Effect.map(([row]) => row.changes),
      ),
    hasCompletedOnboarding: () =>
      sql`SELECT 1 FROM app_settings WHERE key = 'onboarding_completed'`.pipe(
        Effect.map((rows) => rows.length > 0),
      ),
    completeOnboarding: () =>
      sql`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('onboarding_completed', '1')`.pipe(
        Effect.as(undefined),
      ),
    ...makeItems(ctx),
    ...makeEnrichment(ctx),
    ...search,
    ...makeSpaces(ctx, search),
    ...makeExport(ctx),
    ...makeImport(ctx),
  };
});

export class Library extends Context.Service<
  Library,
  Effect.Success<ReturnType<typeof makeLibrary>>
>()("inkling/storage/Library") {}

// Migrations need multi-statement DDL, which the Effect client cannot run, so
// they finish on a plain connection before the client opens the file.
export function libraryLayer({ media = {}, jobQueue, useFts5, ...options }: LibraryOptions) {
  const databasePath = resolve(options.databasePath);
  return Layer.unwrap(
    Effect.try({
      try: () => {
        mkdirSync(dirname(databasePath), { recursive: true });
        const { db, fts5Enabled } = openDatabase(databasePath);
        db.close();
        return fts5Enabled;
      },
      catch: (cause) => cause,
    }).pipe(
      Effect.map((fts5Enabled) =>
        Layer.effect(
          Library,
          makeLibrary(databasePath, fts5Enabled && useFts5 !== false, media),
        ).pipe(
          Layer.provideMerge(Layer.effect(JobQueue, makeJobQueue(jobQueue))),
          Layer.provideMerge(SqliteClient.layer({ filename: databasePath, disableWAL: true })),
        ),
      ),
    ),
  );
}

export type Promised<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Effect.Effect<infer R, infer _E, never>
    ? (...args: A) => Promise<R>
    : T[K];
};

// The Promise face of a service, for IPC handlers and tests. Rejections carry
// the storage message the renderer shows, not the SQL client's summary.
export function promised<T extends object>(
  service: T,
  run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
): Promised<T> {
  const call =
    (method: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const result = method(...args);
      if (!Effect.isEffect(result)) return result;
      return run(result as Effect.Effect<unknown, unknown>).catch((error: unknown) => {
        throw toError(error);
      });
    };
  return Object.fromEntries(
    Object.entries(service).map(([key, value]) => [
      key,
      typeof value === "function" ? call(value) : value,
    ]),
  ) as Promised<T>;
}
