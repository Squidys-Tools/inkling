import { readFile } from "node:fs/promises";
import { Effect } from "effect";
import { attempt, storageFailure } from "./storage/errors.ts";
import type { Job } from "./storage/jobs.ts";
import { JobQueue, Library } from "./storage/library.ts";

export const requireItem = Effect.fnUntraced(function* (id: string, kind?: string) {
  const library = yield* Library;
  const item = yield* library.getItem(id);
  if (!item || (kind && item.kind !== kind))
    return yield* storageFailure(kind ? `${kind} item not found` : "item not found");
  return item;
});

export const readAsset = Effect.fnUntraced(function* (assetPath: string | null) {
  if (!assetPath) return yield* storageFailure("item has no local asset path");
  const library = yield* Library;
  const path = yield* library.resolveAssetPath(assetPath);
  return yield* attempt(() => readFile(path));
});

export const reportProgress = (
  job: Job,
  workerId: string,
  current: number,
  total: number | null,
  message: string,
) => JobQueue.use((jobs) => jobs.updateProgress(job.id, workerId, current, total, message));
