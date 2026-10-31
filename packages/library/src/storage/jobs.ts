import { randomUUID } from "node:crypto";
import { Context, Effect, PubSub } from "effect";
import { SqlClient } from "effect/sql";
import type { Fragment } from "effect/sql/Statement";
import type { Job as JobModel } from "@inkling/contracts";
import { storageFailure } from "./errors.ts";
import { changes } from "./shared.ts";

export const JOB_LEASE_MILLIS = 5 * 60 * 1000;
export const PDF_THUMBNAIL_JOB = "pdf_thumbnail";
export const IMAGE_PALETTE_JOB = "image_palette";
export const IMAGE_THUMBNAIL_JOB = "image_thumbnail";
export const VIDEO_POSTER_JOB = "video_poster";
export const URL_ENRICHMENT_JOB = "enrich_url";
const SILENT_JOB_KINDS = new Set([
  PDF_THUMBNAIL_JOB,
  IMAGE_PALETTE_JOB,
  IMAGE_THUMBNAIL_JOB,
  VIDEO_POSTER_JOB,
]);
const silentKindsSql = [...SILENT_JOB_KINDS].map((kind) => `'${kind}'`).join(", ");

type JobRow = {
  id: string;
  item_id: string;
  kind: string;
  status: string;
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  progress_current: number;
  progress_total: number | null;
  progress_message: string | null;
};

type JobOwner = { item_id: string; kind: string };

export type Job = JobModel;

function jobFromRow(row: JobRow): Job {
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind as Job["kind"],
    status: row.status as Job["status"],
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    progressMessage: row.progress_message,
  };
}

export type JobQueueOptions = {
  now?: () => number;
  onUpdated?: (itemId: string) => void;
};

export const makeJobQueue = Effect.fnUntraced(function* ({
  now = Date.now,
  onUpdated = () => {},
}: JobQueueOptions = {}) {
  const sql = yield* SqlClient.SqlClient;
  // Workers listen here for newly queued kinds, so capture never waits for a poll.
  const enqueued = yield* PubSub.unbounded<string>();

  const notify = (itemId: string) => Effect.sync(() => onUpdated(itemId));
  const announce = (job: JobOwner | undefined) =>
    job && !SILENT_JOB_KINDS.has(job.kind) ? notify(job.item_id) : Effect.void;
  const owned = (jobId: string, workerId: string) =>
    sql<JobOwner>`SELECT item_id, kind FROM jobs
      WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`.pipe(
      Effect.map((rows) => rows[0]),
    );

  // Inside a transaction the announcement waits for its commit, and a rollback drops it.
  const enqueue = Effect.fnUntraced(function* (itemId: string, kind: string) {
    const [existing] = yield* sql<{ id: string }>`SELECT id FROM jobs
      WHERE item_id = ${itemId} AND kind = ${kind} AND status IN ('pending', 'processing')
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`;
    if (existing) return existing.id;
    const id = randomUUID();
    yield* sql`INSERT INTO jobs (id, item_id, kind, status, created_at)
      VALUES (${id}, ${itemId}, ${kind}, 'pending', ${now()})`;
    yield* sql.afterCommit(
      Effect.andThen(announce({ item_id: itemId, kind }), PubSub.publish(enqueued, kind)),
    );
    return id;
  });

  // Only each item's latest job per kind counts toward its status. The ids go in
  // as one JSON value so a large library cannot hit SQLite's parameter limit.
  const getForItems = (itemIds: ReadonlyArray<string>) =>
    itemIds.length === 0
      ? Effect.succeed([] as Job[])
      : sql<JobRow>`SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY item_id, kind ORDER BY created_at DESC) AS rank
          FROM jobs WHERE item_id IN (SELECT value FROM json_each(${JSON.stringify(itemIds)}))
          AND kind NOT IN (${sql.literal(silentKindsSql)})
        ) WHERE rank = 1 ORDER BY created_at DESC`.pipe(Effect.map((rows) => rows.map(jobFromRow)));

  const getForItem = (itemId: string) =>
    sql<JobRow>`SELECT * FROM jobs WHERE item_id = ${itemId}
      AND kind NOT IN (${sql.literal(silentKindsSql)}) ORDER BY created_at DESC`.pipe(
      Effect.map((rows) => rows.map(jobFromRow)),
    );

  const countActive = () =>
    sql<{ count: number }>`SELECT COUNT(*) AS count FROM jobs
    WHERE status IN ('pending', 'processing') AND kind NOT IN (${sql.literal(silentKindsSql)})`.pipe(
      Effect.map((rows) => rows[0].count),
    );

  const enqueueOcr = Effect.fnUntraced(function* (itemId: string) {
    const [item] = yield* sql<{ kind: string }>`SELECT kind FROM items WHERE id = ${itemId}`;
    if (!item) return yield* storageFailure("item not found");
    const kind = item.kind === "image" ? "ocr_image" : item.kind === "pdf" ? "ocr_pdf_page" : null;
    if (!kind) return yield* storageFailure("OCR is only available for image and PDF items");
    return yield* enqueue(itemId, kind);
  });

  const claimNext = Effect.fnUntraced(function* (
    workerId: string,
    kinds: ReadonlyArray<string> | null = null,
  ) {
    if (kinds && kinds.length === 0) return null;
    const kindFilter = kinds ? sql`AND kind IN ${sql.in(kinds)}` : sql.literal("");
    const claimed = yield* sql.withTransaction(
      Effect.gen(function* () {
        // An item's jobs on one set of lanes run one at a time, in the order queued,
        // so its embedding still waits for its OCR text when several lanes claim.
        const busyFilter = kinds ? sql`AND busy.kind IN ${sql.in(kinds)}` : sql.literal("");
        const [row] = yield* sql<JobRow>`SELECT * FROM jobs WHERE status = 'pending' ${kindFilter}
          AND NOT EXISTS (SELECT 1 FROM jobs busy WHERE busy.item_id = jobs.item_id
            AND busy.status = 'processing' ${busyFilter})
          ORDER BY created_at ASC LIMIT 1`;
        if (!row) return null;
        const startedAt = now();
        const updated = yield* sql`UPDATE jobs SET status = 'processing', started_at = ${startedAt},
          worker_id = ${workerId}, lease_until = ${startedAt + JOB_LEASE_MILLIS},
          progress_current = 0, progress_message = NULL
          WHERE id = ${row.id} AND status = 'pending'`.raw;
        return changes(updated) ? row : null;
      }),
    );
    if (!claimed) return null;
    yield* announce(claimed);
    const [row] = yield* sql<JobRow>`SELECT * FROM jobs WHERE id = ${claimed.id}`;
    return row ? jobFromRow(row) : null;
  });

  const renew = Effect.fnUntraced(function* (jobId: string, workerId: string) {
    const updated = yield* sql`UPDATE jobs SET lease_until = ${now() + JOB_LEASE_MILLIS}
      WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`.raw;
    if (!changes(updated)) return false;
    const [job] = yield* sql<JobOwner>`SELECT item_id, kind FROM jobs WHERE id = ${jobId}`;
    yield* announce(job);
    return true;
  });

  const complete = Effect.fnUntraced(function* (jobId: string, workerId: string) {
    const job = yield* owned(jobId, workerId);
    if (!job) return false;
    const completedAt = now();
    const updated = yield* sql`UPDATE jobs SET status = 'completed', completed_at = ${completedAt},
      error_message = NULL, started_at = COALESCE(started_at, ${completedAt}), worker_id = NULL,
      lease_until = NULL, progress_current = COALESCE(progress_total, progress_current),
      progress_message = NULL
      WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`.raw;
    if (!changes(updated)) return false;
    yield* announce(job);
    // Wakes idle lanes: the item's next job may have been waiting on this one.
    yield* PubSub.publish(enqueued, job.kind);
    return true;
  });

  const fail = Effect.fnUntraced(function* (jobId: string, workerId: string, error: string) {
    const job = yield* owned(jobId, workerId);
    if (!job) return false;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const failedAt = now();
        const retrying = yield* sql`UPDATE jobs SET error_message = ${error},
          started_at = COALESCE(started_at, ${failedAt})
          WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}
          AND retry_count < max_retries`.raw;
        if (changes(retrying)) {
          yield* sql`UPDATE jobs SET status = 'pending', retry_count = retry_count + 1,
            worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
            WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`;
        } else {
          yield* sql`UPDATE jobs SET status = 'failed', completed_at = ${failedAt},
            error_message = ${error}, progress_message = ${error}, worker_id = NULL,
            lease_until = NULL
            WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`;
        }
      }),
    );
    yield* announce(job);
    return true;
  });

  // Hands an interrupted job back untouched, so quitting mid-job costs no retry.
  const release = Effect.fnUntraced(function* (jobId: string, workerId: string) {
    const job = yield* owned(jobId, workerId);
    if (!job) return false;
    yield* sql`UPDATE jobs SET status = 'pending', started_at = NULL, worker_id = NULL,
      lease_until = NULL, progress_current = 0, progress_message = NULL
      WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`;
    yield* announce(job);
    yield* PubSub.publish(enqueued, job.kind);
    return true;
  });

  const updateProgress = Effect.fnUntraced(function* (
    jobId: string,
    workerId: string,
    current: number,
    total: number | null = null,
    message: string | null = null,
  ) {
    const job = yield* owned(jobId, workerId);
    if (!job) return false;
    const progressCurrent = Math.max(0, current || 0);
    const progressTotal = total == null ? null : Math.max(progressCurrent, total || 0);
    const updated = yield* sql`UPDATE jobs SET progress_current = ${progressCurrent},
      progress_total = ${progressTotal}, progress_message = ${message}
      WHERE id = ${jobId} AND status = 'processing' AND worker_id = ${workerId}`.raw;
    if (!changes(updated)) return false;
    yield* announce(job);
    return true;
  });

  const retry = Effect.fnUntraced(function* (jobId: string) {
    const [job] = yield* sql<JobOwner>`SELECT item_id, kind FROM jobs
      WHERE id = ${jobId} AND status = 'failed'`;
    if (!job) return false;
    const updated = yield* sql`UPDATE jobs SET status = 'pending', error_message = NULL,
      started_at = NULL, completed_at = NULL, worker_id = NULL, lease_until = NULL,
      retry_count = 0, progress_current = 0, progress_message = NULL
      WHERE id = ${jobId} AND status = 'failed'`.raw;
    if (!changes(updated)) return false;
    yield* announce(job);
    yield* PubSub.publish(enqueued, job.kind);
    return true;
  });

  const requeue = Effect.fnUntraced(function* (condition: Fragment) {
    const rows = yield* sql.withTransaction(
      Effect.gen(function* () {
        const rows = yield* sql<JobOwner>`SELECT item_id, kind FROM jobs
          WHERE status = 'processing' AND ${condition}`;
        if (rows.length === 0) return rows;
        yield* sql`UPDATE jobs SET status = 'pending', started_at = NULL, error_message = NULL,
          worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
          WHERE status = 'processing' AND ${condition}`;
        return rows;
      }),
    );
    yield* Effect.forEach(rows, announce, { discard: true });
    return rows.length;
  });

  // The app holds a single-instance lock, so at startup every processing job
  // belongs to a process that is gone and can be handed back right away.
  const recoverAfterExclusiveStartup = () => requeue(sql.literal("1 = 1"));

  const recoverExpired = () =>
    Effect.suspend(() => requeue(sql`(lease_until IS NULL OR lease_until <= ${now()})`));

  return {
    notify,
    enqueued,
    enqueue,
    getForItems,
    getForItem,
    countActive,
    enqueueOcr,
    claimNext,
    renew,
    complete,
    fail,
    release,
    updateProgress,
    retry,
    recoverAfterExclusiveStartup,
    recoverExpired,
  };
});

export class JobQueue extends Context.Service<
  JobQueue,
  Effect.Success<ReturnType<typeof makeJobQueue>>
>()("inkling/storage/JobQueue") {}
