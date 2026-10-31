import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Effect, Fiber, ManagedRuntime } from "effect";
import type { SqlClient } from "effect/sql";
import { JobQueue, Library, type LibraryOptions, libraryLayer, promised } from "./library.ts";
import { makeWorker, type WorkerOptions } from "./worker.ts";

type Services = Library | JobQueue | SqlClient.SqlClient;

export type TestLibraryOptions = Omit<LibraryOptions, "databasePath" | "appVersion"> &
  Partial<Pick<LibraryOptions, "appVersion">>;

// Tests drive the library through the same Promise facade the IPC handlers use,
// and set up or inspect rows through a second, plain connection to the file.
export async function openTestLibrary(databasePath: string, options: TestLibraryOptions = {}) {
  const runtime = ManagedRuntime.make(
    libraryLayer({ databasePath, appVersion: "0.0.0-test", ...options }),
  );
  const run = <A, E>(effect: Effect.Effect<A, E, Services>) => runtime.runPromise(effect);
  const [library, jobs] = await run(
    Effect.gen(function* () {
      return [yield* Library, yield* JobQueue] as const;
    }),
  );
  const db = new DatabaseSync(resolve(databasePath));
  db.exec("PRAGMA busy_timeout = 5000");
  const fibers = new Set<Fiber.Fiber<unknown, unknown>>();

  const worker = async (workerOptions: WorkerOptions<Library | JobQueue>) => {
    const created = await run(makeWorker(workerOptions));
    return {
      drain: () => run(created.drain),
      // Runs until stopped, waking on enqueue or each poll.
      start: () => {
        const fiber = runtime.runFork(created.run);
        fibers.add(fiber);
        return async () => {
          fibers.delete(fiber);
          await run(Fiber.interrupt(fiber));
        };
      },
    };
  };

  return Object.assign(promised(library, run), {
    jobs: promised(jobs, run),
    // The Effect services themselves, for tests that provide a modified copy.
    services: { library, jobs },
    db,
    run,
    worker,
    close: async () => {
      for (const fiber of fibers) await run(Fiber.interrupt(fiber));
      db.close();
      await runtime.dispose();
    },
  });
}

export type TestLibrary = Awaited<ReturnType<typeof openTestLibrary>>;
