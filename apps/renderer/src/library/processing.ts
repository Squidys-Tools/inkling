import type { Job } from "@inkling/contracts";

/** What a card shows about its background jobs. Items with nothing running or failed have none. */
export type Processing = {
  active: boolean;
  message: string | null;
  progressCurrent: number;
  progressTotal: number | null;
  failedJob: { id: string; message: string } | null;
};

/**
 * Only the latest job of each kind counts: a retried job that succeeded
 * hides the failure before it.
 */
export function summarizeJobs(jobs: readonly Job[]): Processing | null {
  const latest = new Map<string, Job>();
  for (const job of jobs) {
    const previous = latest.get(job.kind);
    if (!previous || job.createdAt > previous.createdAt) latest.set(job.kind, job);
  }
  const current = [...latest.values()];
  const failed = current.find((job) => job.status === "failed");
  const active = current.filter((job) => job.status === "pending" || job.status === "processing");
  if (!failed && active.length === 0) return null;
  const totals = active.filter((job) => job.progressTotal !== null);
  return {
    active: active.length > 0,
    message: active.find((job) => job.progressMessage)?.progressMessage ?? null,
    progressCurrent: totals.reduce((sum, job) => sum + job.progressCurrent, 0),
    progressTotal: totals.length
      ? totals.reduce((sum, job) => sum + (job.progressTotal ?? 0), 0)
      : null,
    failedJob: failed
      ? { id: failed.id, message: failed.errorMessage ?? "Processing failed" }
      : null,
  };
}

const same = (left: Processing | undefined, right: Processing | null) =>
  left !== undefined &&
  right !== null &&
  left.active === right.active &&
  left.message === right.message &&
  left.progressCurrent === right.progressCurrent &&
  left.progressTotal === right.progressTotal &&
  left.failedJob?.id === right.failedJob?.id;

/** Applies fresh job lists for `itemIds`, keeping unchanged summaries so their cards stay put. */
export function withJobs(
  current: ReadonlyMap<string, Processing>,
  itemIds: readonly string[],
  jobs: readonly Job[],
) {
  const byItem = new Map<string, Job[]>();
  for (const job of jobs) byItem.set(job.itemId, [...(byItem.get(job.itemId) ?? []), job]);
  let next: Map<string, Processing> | null = null;
  for (const id of itemIds) {
    const summary = summarizeJobs(byItem.get(id) ?? []);
    const previous = current.get(id);
    if (same(previous, summary) || (!previous && !summary)) continue;
    next ??= new Map(current);
    if (summary) next.set(id, summary);
    else next.delete(id);
  }
  return next ?? current;
}
