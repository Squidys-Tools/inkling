import { Duration, Effect, Exit, Fiber, Option } from "effect";
import { JobsWorker, workerClient } from "./worker-client.ts";

// A busy worker, or one without models yet, must not hold up a search: past this
// wait, or on any failure, search ranks by text alone. With no worker it does so at once.
const queryWait = Duration.seconds(5);

// Typing back over a query, or a Smart Space re-running its text, asks the same
// worker for the same vector again; its model's answer for a text never changes.
const recentLimit = 64;
type Vector = ReadonlyArray<number>;
type Memo = { recent: Map<string, Vector>; running: Map<string, Fiber.Fiber<Vector, unknown>> };
const memoByWorker = new WeakMap<object, Memo>();

const remember = (recent: Map<string, Vector>, query: string, vector: Vector) => {
  recent.delete(query);
  recent.set(query, vector);
  if (recent.size > recentLimit) recent.delete(recent.keys().next().value!);
};

// One embed per text per worker, shared by every caller asking while it runs. It
// outlives a caller that stopped waiting, so a slow first query still warms the
// model and lands in the cache for the next one.
const embedOnce = (text: string, wait: Duration.Input) =>
  workerClient.pipe(
    Effect.flatMap((worker) => {
      let memo = memoByWorker.get(worker);
      if (!memo) memoByWorker.set(worker, (memo = { recent: new Map(), running: new Map() }));
      const { recent, running } = memo;
      const cached = recent.get(text);
      if (cached) {
        remember(recent, text, cached);
        return Effect.succeed(Option.some(cached));
      }
      const join = (fiber: Fiber.Fiber<Vector, unknown>) =>
        Fiber.join(fiber).pipe(Effect.timeoutOption(wait));
      const current = running.get(text);
      if (current) return join(current);
      return worker.embedQuery({ text }).pipe(
        Effect.tap((vector) => Effect.sync(() => remember(recent, text, vector))),
        Effect.ensuring(Effect.sync(() => running.delete(text))),
        Effect.forkDetach,
        Effect.tap((fiber) => Effect.sync(() => running.set(text, fiber))),
        Effect.flatMap(join),
      );
    }),
    Effect.exit,
    Effect.map((exit) => (Exit.isSuccess(exit) ? Option.getOrNull(exit.value) : null)),
  );

export const queryVector = (text: string) => {
  const query = text.trim();
  return query ? embedOnce(query, queryWait) : Effect.succeed(null);
};

// Starts the query's embed without waiting for it, so a text-first search has its
// vector on the way, or cached, by the time the semantic pass asks.
export const prefetchQueryVector = (text: string) => {
  const query = text.trim();
  return query ? Effect.asVoid(embedOnce(query, Duration.millis(0))) : Effect.void;
};

// Loads the query model before the first search needs it. Its vector is never used.
// The worker's port can arrive after the library starts, so this waits for it.
export const warmQueryModel = JobsWorker.use((worker) => worker.connected).pipe(
  Effect.andThen(prefetchQueryVector("warm up")),
);
