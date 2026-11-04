import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Effect, Fiber, ManagedRuntime } from "effect";
import type { SqlClient } from "effect/sql";
import { SqlError } from "effect/sql/SqlError";
import { errorMessage } from "./errors.ts";
import { JobQueue, Library, type LibraryOptions, libraryLayer } from "./library.ts";
import { makeWorker, type WorkerOptions } from "./worker.ts";

type Services = Library | JobQueue | SqlClient.SqlClient;

type Promised<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Effect.Effect<infer R, infer _E, never>
    ? (...args: A) => Promise<R>
    : T[K];
};

// Rejections carry the storage message the renderer shows, not the SQL client's summary.
function promised<T extends object>(
  service: T,
  run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
): Promised<T> {
  const call =
    (method: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const result = method(...args);
      if (!Effect.isEffect(result)) return result;
      return run(result as Effect.Effect<unknown, unknown>).catch((error: unknown) => {
        throw error instanceof SqlError ? new Error(errorMessage(error), { cause: error }) : error;
      });
    };
  return Object.fromEntries(
    Object.entries(service).map(([key, value]) => [
      key,
      typeof value === "function" ? call(value) : value,
    ]),
  ) as Promised<T>;
}

// Tests drive the library through a Promise facade, and set up or inspect rows
// through a second, plain connection to the file.
export async function openTestLibrary(
  databasePath: string,
  options: Omit<LibraryOptions, "databasePath" | "appVersion"> & { appVersion?: string } = {},
) {
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
