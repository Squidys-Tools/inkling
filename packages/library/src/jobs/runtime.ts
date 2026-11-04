import { Effect, Layer } from "effect";
import { JobQueue, URL_ENRICHMENT_JOB } from "../storage/jobs.ts";
import { type Library } from "../storage/library.ts";
import { makeWorker, type Processor } from "../storage/worker.ts";
import { enqueueLongTextEmbeddings, enqueueStaleImageEmbeddings } from "./embedding-jobs.ts";
import { createJobProcessors, jobTimeouts } from "./processors.ts";
import { JobsWorker } from "./worker-client.ts";

type Services = Library | JobQueue | JobsWorker;

/** Main-lane jobs that run at once. Each item's own jobs still run one at a time, in order. */
const MAIN_LANES = 4;

/**
 * Hands back jobs a previous run left behind, then runs every lane until the
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
      yield* enqueueLongTextEmbeddings;
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
      // A saved page shows only its domain until this runs, and OCR and embeddings of a large
      // import can hold every main lane for many minutes. It keeps the main lanes' per-item order:
      // an enrichment landing mid-embedding would queue no new embedding of the page's text.
      const pages = yield* makeWorker<Services>({
        processors: announced({ [URL_ENRICHMENT_JOB]: processors[URL_ENRICHMENT_JOB] }),
        itemKinds: Object.keys(processors),
        timeouts: jobTimeouts,
        ready,
      });
      for (const lane of main) yield* Effect.forkScoped(lane.run);
      yield* Effect.forkScoped(thumbnails.run);
      yield* Effect.forkScoped(pages.run);
    }),
  );
};
