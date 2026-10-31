import { Effect } from "effect";
import { storageFailure } from "../storage/errors.ts";
import type { Job } from "../storage/jobs.ts";
import { JobQueue, Library } from "../storage/library.ts";

export const requireItem = Effect.fnUntraced(function* (id: string, kind?: string) {
  const library = yield* Library;
  const item = yield* library.getItem(id);
  if (!item || (kind && item.kind !== kind))
    return yield* storageFailure(kind ? `${kind} item not found` : "item not found");
  return item;
});

// The worker reads assets by absolute path, so every path it gets passes the
// library's containment check first.
export const assetPath = Effect.fnUntraced(function* (path: string | null) {
  if (!path) return yield* storageFailure("item has no local asset path");
  const library = yield* Library;
  return yield* library.resolveAssetPath(path);
});

export const reportProgress = (
  job: Job,
  workerId: string,
  current: number,
  total: number | null,
  message: string,
) => JobQueue.use((jobs) => jobs.updateProgress(job.id, workerId, current, total, message));
