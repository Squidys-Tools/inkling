import { randomUUID } from "node:crypto";
import { nowMillis } from "./shared.mjs";

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

function jobFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    status: row.status,
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

export class JobQueue {
  constructor(db, { now = nowMillis, onUpdated = () => {} } = {}) {
    this.db = db;
    this.now = now;
    this.onUpdated = onUpdated;
  }

  notify(itemId) {
    this.onUpdated(itemId);
  }

  announce(job) {
    if (!SILENT_JOB_KINDS.has(job.kind)) this.notify(job.item_id);
  }

  enqueue(itemId, kind, { notify = true } = {}) {
    const existing = this.db
      .prepare(`SELECT id FROM jobs WHERE item_id = ? AND kind = ? AND status IN ('pending', 'processing')
        ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`)
      .get(itemId, kind);
    if (existing) return existing.id;
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO jobs (id, item_id, kind, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
      )
      .run(id, itemId, kind, this.now());
    if (notify) this.announce({ item_id: itemId, kind });
    return id;
  }

  // Only each item's latest job per kind counts toward its status. The ids go in
  // as one JSON value so a large library cannot hit SQLite's parameter limit.
  getForItems(itemIds) {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
    return this.db
      .prepare(`SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY item_id, kind ORDER BY created_at DESC) AS rank
          FROM jobs WHERE item_id IN (SELECT value FROM json_each(?)) AND kind NOT IN (${silentKindsSql})
        ) WHERE rank = 1 ORDER BY created_at DESC`)
      .all(JSON.stringify(itemIds))
      .map(jobFromRow);
  }

  getForItem(itemId) {
    return this.db
      .prepare(
        `SELECT * FROM jobs WHERE item_id = ? AND kind NOT IN (${silentKindsSql}) ORDER BY created_at DESC`,
      )
      .all(itemId)
      .map(jobFromRow);
  }

  countActive() {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM jobs WHERE status IN ('pending', 'processing')
        AND kind NOT IN (${silentKindsSql})`,
      )
      .get().count;
  }

  enqueueOcr(itemId) {
    const item = this.db.prepare("SELECT kind FROM items WHERE id = ?").get(itemId);
    if (!item) throw new Error("item not found");
    const kind = item.kind === "image" ? "ocr_image" : item.kind === "pdf" ? "ocr_pdf_page" : null;
    if (!kind) throw new Error("OCR is only available for image and PDF items");
    return this.enqueue(itemId, kind);
  }

  claimNext(workerId, kinds = null) {
    if (Array.isArray(kinds) && kinds.length === 0) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const kindFilter = kinds ? ` AND kind IN (${kinds.map(() => "?").join(", ")})` : "";
      const row = this.db
        .prepare(
          `SELECT * FROM jobs WHERE status = 'pending'${kindFilter} ORDER BY created_at ASC LIMIT 1`,
        )
        .get(...(kinds ?? []));
      if (!row) {
        this.db.exec("COMMIT");
        return null;
      }
      const now = this.now();
      const updated = this.db
        .prepare(`UPDATE jobs SET status = 'processing', started_at = ?, worker_id = ?, lease_until = ?,
          progress_current = 0, progress_message = NULL WHERE id = ? AND status = 'pending'`)
        .run(now, workerId, now + JOB_LEASE_MILLIS, row.id).changes;
      this.db.exec("COMMIT");
      if (!updated) return null;
      this.announce(row);
      return jobFromRow(this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id));
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  renew(jobId, workerId) {
    const updated =
      this.db
        .prepare(
          `UPDATE jobs SET lease_until = ? WHERE id = ? AND status = 'processing' AND worker_id = ?`,
        )
        .run(this.now() + JOB_LEASE_MILLIS, jobId, workerId).changes > 0;
    if (updated)
      this.announce(this.db.prepare("SELECT item_id, kind FROM jobs WHERE id = ?").get(jobId));
    return updated;
  }

  complete(jobId, workerId) {
    const item = this.db
      .prepare(
        "SELECT item_id, kind FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?",
      )
      .get(jobId, workerId);
    if (!item) return false;
    const now = this.now();
    const updated =
      this.db
        .prepare(`UPDATE jobs SET status = 'completed', completed_at = ?, error_message = NULL,
      started_at = COALESCE(started_at, ?), worker_id = NULL, lease_until = NULL,
      progress_current = COALESCE(progress_total, progress_current), progress_message = NULL
      WHERE id = ? AND status = 'processing' AND worker_id = ?`)
        .run(now, now, jobId, workerId).changes > 0;
    if (updated) this.announce(item);
    return updated;
  }

  fail(jobId, workerId, error) {
    const item = this.db
      .prepare(
        "SELECT item_id, kind FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?",
      )
      .get(jobId, workerId);
    if (!item) return false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = this.now();
      const retrying =
        this.db
          .prepare(`UPDATE jobs SET error_message = ?, started_at = COALESCE(started_at, ?)
        WHERE id = ? AND status = 'processing' AND worker_id = ? AND retry_count < max_retries`)
          .run(String(error), now, jobId, workerId).changes > 0;
      if (retrying) {
        this.db
          .prepare(`UPDATE jobs SET status = 'pending', retry_count = retry_count + 1,
          worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
          WHERE id = ? AND status = 'processing' AND worker_id = ?`)
          .run(jobId, workerId);
      } else {
        this.db
          .prepare(`UPDATE jobs SET status = 'failed', completed_at = ?, error_message = ?,
          progress_message = ?, worker_id = NULL, lease_until = NULL
          WHERE id = ? AND status = 'processing' AND worker_id = ?`)
          .run(now, String(error), String(error), jobId, workerId);
      }
      this.db.exec("COMMIT");
      this.announce(item);
      return true;
    } catch (failure) {
      this.db.exec("ROLLBACK");
      throw failure;
    }
  }

  updateProgress(jobId, workerId, current, total = null, message = null) {
    const item = this.db
      .prepare(
        "SELECT item_id, kind FROM jobs WHERE id = ? AND status = 'processing' AND worker_id = ?",
      )
      .get(jobId, workerId);
    if (!item) return false;
    const progressCurrent = Math.max(0, Number(current) || 0);
    const progressTotal = total == null ? null : Math.max(progressCurrent, Number(total) || 0);
    const updated =
      this.db
        .prepare(`UPDATE jobs SET progress_current = ?, progress_total = ?, progress_message = ?
      WHERE id = ? AND status = 'processing' AND worker_id = ?`)
        .run(
          progressCurrent,
          progressTotal,
          message == null ? null : String(message),
          jobId,
          workerId,
        ).changes > 0;
    if (updated) this.announce(item);
    return updated;
  }

  retry(jobId) {
    const row = this.db
      .prepare("SELECT item_id, kind FROM jobs WHERE id = ? AND status = 'failed'")
      .get(jobId);
    if (!row) return false;
    const updated =
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', error_message = NULL,
      started_at = NULL, completed_at = NULL, worker_id = NULL, lease_until = NULL,
      retry_count = 0, progress_current = 0, progress_message = NULL
      WHERE id = ? AND status = 'failed'`)
        .run(jobId).changes > 0;
    if (updated) this.announce(row);
    return updated;
  }

  recoverUrlEnrichmentAfterExclusiveStartup() {
    this.db.exec("BEGIN IMMEDIATE");
    let rows;
    try {
      rows = this.db
        .prepare("SELECT item_id FROM jobs WHERE kind = ? AND status = 'processing'")
        .all(URL_ENRICHMENT_JOB);
      if (rows.length === 0) {
        this.db.exec("COMMIT");
        return 0;
      }
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', started_at = NULL, error_message = NULL,
        worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
        WHERE kind = ? AND status = 'processing'`)
        .run(URL_ENRICHMENT_JOB);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    for (const row of rows) this.announce({ item_id: row.item_id, kind: URL_ENRICHMENT_JOB });
    return rows.length;
  }

  recoverExpired() {
    const now = this.now();
    let rows;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      rows = this.db
        .prepare(`SELECT item_id, kind FROM jobs WHERE status = 'processing'
        AND (lease_until IS NULL OR lease_until <= ?)`)
        .all(now);
      if (rows.length === 0) {
        this.db.exec("COMMIT");
        return 0;
      }
      this.db
        .prepare(`UPDATE jobs SET status = 'pending', started_at = NULL, error_message = NULL,
        worker_id = NULL, lease_until = NULL, progress_current = 0, progress_message = NULL
        WHERE status = 'processing' AND (lease_until IS NULL OR lease_until <= ?)`)
        .run(now);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    for (const row of rows) this.announce(row);
    return rows.length;
  }
}

export class JobWorker {
  constructor(
    storage,
    { processors = {}, pollInterval = 5000, workerId = randomUUID(), onIdle } = {},
  ) {
    this.storage = storage;
    this.onIdle = onIdle;
    this.queue = storage.jobs;
    this.processors = processors;
    this.pollInterval = pollInterval;
    this.workerId = workerId;
    this.timer = null;
    this.running = false;
    this.stopped = false;
    this.stopWaiters = [];
  }

  start() {
    this.queue.recoverExpired();
    this.stopped = false;
    this.timer = setInterval(() => void this.pump(), this.pollInterval);
    this.timer.unref?.();
    void this.pump();
    return this;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.stopWaiters.push(resolve));
  }

  async pump() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const kinds = Object.keys(this.processors);
      const claim = () => {
        const claimed = this.queue.claimNext(this.workerId, kinds);
        if (claimed || !this.onIdle) return claimed;
        this.onIdle(this.storage);
        return this.queue.claimNext(this.workerId, kinds);
      };
      let job = claim();
      while (job) {
        const processor = this.processors[job.kind];
        const heartbeat = setInterval(
          () => this.queue.renew(job.id, this.workerId),
          JOB_LEASE_MILLIS / 2,
        );
        heartbeat.unref?.();
        try {
          await processor(job, this.storage, this.workerId);
          this.queue.complete(job.id, this.workerId);
        } catch (error) {
          this.queue.fail(
            job.id,
            this.workerId,
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          clearInterval(heartbeat);
        }
        if (this.stopped) break;
        job = claim();
      }
    } finally {
      this.running = false;
      for (const resolve of this.stopWaiters.splice(0)) resolve();
    }
  }
}
