import { Effect, Layer } from "effect";
import { JobQueue, type Library } from "../storage/library.ts";
import { makeWorker, type Processor } from "../storage/worker.ts";
import { enqueueStaleImageEmbeddings } from "./embedding-jobs.ts";
import { createJobProcessors, jobTimeouts } from "./processors.ts";
import { JobsWorker } from "./worker-client.ts";

type Services = Library | JobQueue | JobsWorker;

/** Main-lane jobs that run at once. Each item's own jobs still run one at a time, in order. */
export const MAIN_LANES = 4;

/**
 * Hands back jobs a previous run left behind, then runs both lanes until the
 * layer closes. Closing it interrupts each lane, which hands its job back.
 * `onItemChanged` hears of each finished job, whose result may be on its card.
 */
export const jobLanesLayer = (onItemChanged: (itemId: string) => Effect.Effect<unknown>) => {
  const announced = (set: Record<string, Processor<Services>>) =>
    Object.fromEntries(
      Object.entries(set).map(([kind, processor]): [string, Processor<Services>] => [
        kind,
        (job, workerId) =>
          processor(job, workerId).pipe(Effect.tap(() => onItemChanged(job.itemId))),
      ]),
    );
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const jobs = yield* JobQueue;
      // Main holds the single-instance lock, so no other process owns a processing job.
      yield* jobs.recoverAfterExclusiveStartup();
      yield* enqueueStaleImageEmbeddings;
      const { processors, thumbnailProcessors, onIdle } = createJobProcessors();
      // Every job needs the worker process, so neither lane claims while it is gone.
      const ready = JobsWorker.use((worker) => worker.connected);
      // Only the first lane runs the backfill, so it never queues the same work twice at once.
      const main = yield* Effect.forEach(
        Array.from({ length: MAIN_LANES }, (_, lane) => lane),
        (lane) =>
          makeWorker<Services>({
            processors: announced(processors),
            onIdle: lane === 0 ? onIdle : undefined,
            timeouts: jobTimeouts,
            ready,
          }),
      );
      const thumbnails = yield* makeWorker<Services>({
        processors: announced(thumbnailProcessors),
        timeouts: jobTimeouts,
        ready,
      });
      for (const lane of main) yield* Effect.forkScoped(lane.run);
      yield* Effect.forkScoped(thumbnails.run);
    }),
  );
};
