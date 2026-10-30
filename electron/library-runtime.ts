import { Effect, Layer, ManagedRuntime } from "effect";
import { type createAiJobProcessors, jobTimeouts } from "./ai-jobs.ts";
import { enqueueStaleImageEmbeddings } from "./embedding-jobs.ts";
import { snapshotDatabase } from "./sqlite-snapshot.ts";
import { JobQueue, Library, libraryLayer, promised } from "./storage/library.ts";
import { makeWorker } from "./storage/worker.ts";

export type LibraryRuntime = Awaited<ReturnType<typeof openLibraryRuntime>>;

// Opening the library migrates it, hands back jobs a previous run left behind,
// and starts both workers. Disposing the runtime hands any running job back.
export async function openLibraryRuntime({
  databasePath,
  ai,
  onJobUpdated,
}: {
  databasePath: string;
  ai: ReturnType<typeof createAiJobProcessors>;
  onJobUpdated: (itemId: string) => void;
}) {
  const library = libraryLayer({
    databasePath,
    jobQueue: { onUpdated: onJobUpdated },
    media: {
      createSnapshot: snapshotDatabase,
      createThumbnail: (bytes) =>
        import("./thumbnail.ts").then(({ createImageThumbnail }) => createImageThumbnail(bytes)),
      inspectImage: (bytes) =>
        import("./thumbnail.ts").then(({ inspectImage }) => inspectImage(bytes)),
    },
  });
  const workers = Layer.effectDiscard(
    Effect.gen(function* () {
      const jobs = yield* JobQueue;
      // The single-instance lock means no other process can own a processing job.
      yield* jobs.recoverAfterExclusiveStartup();
      yield* enqueueStaleImageEmbeddings;
      const main = yield* makeWorker({
        processors: ai.processors,
        onIdle: ai.onIdle,
        timeouts: jobTimeouts,
      });
      const thumbnails = yield* makeWorker({
        processors: ai.thumbnailProcessors,
        timeouts: jobTimeouts,
      });
      yield* Effect.forkScoped(main.run);
      yield* Effect.forkScoped(thumbnails.run);
    }),
  );
  const runtime = ManagedRuntime.make(workers.pipe(Layer.provideMerge(library)));
  const run = <A, E>(effect: Effect.Effect<A, E, Library | JobQueue>) => runtime.runPromise(effect);
  try {
    const [libraryService, jobService] = await run(
      Effect.gen(function* () {
        return [yield* Library, yield* JobQueue] as const;
      }),
    );
    return { runtime, library: promised(libraryService, run), jobs: promised(jobService, run) };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
