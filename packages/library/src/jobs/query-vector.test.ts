import { expect, test } from "bun:test";
import { Deferred, Effect, Layer } from "effect";
import { prefetchQueryVector, queryVector, warmQueryModel } from "./query-vector.ts";
import { JobsWorker, type WorkerClient } from "./worker-client.ts";

type Embed = (input: { text: string }) => Effect.Effect<ReadonlyArray<number>, unknown>;

const provide = (embedQuery: Embed, connected: Effect.Effect<void> = Effect.void) => {
  const worker = { embedQuery } as unknown as WorkerClient;
  return Layer.succeed(JobsWorker, { client: Effect.succeed(worker), connected } as never);
};
const run = <A>(layer: Layer.Layer<JobsWorker>, effect: Effect.Effect<A, never, JobsWorker>) =>
  Effect.runPromise(Effect.provide(effect, layer));

test("a failed embed does not stop the next query from embedding", async () => {
  let calls = 0;
  const layer = provide(() => {
    calls += 1;
    return Effect.fail(new Error("model unavailable"));
  });
  expect(await run(layer, queryVector("cats"))).toBeNull();
  expect(await run(layer, queryVector("cats"))).toBeNull();
  expect(calls).toBe(2);
});

test("a query's vector is remembered", async () => {
  let calls = 0;
  const layer = provide(() => {
    calls += 1;
    return Effect.succeed([1, 2]);
  });
  expect(await run(layer, queryVector("dogs"))).toEqual([1, 2]);
  expect(await run(layer, queryVector(" dogs "))).toEqual([1, 2]);
  expect(calls).toBe(1);
});

test("an embed outlives a caller that stopped waiting and serves the next query", async () => {
  let calls = 0;
  const release = Effect.runSync(Deferred.make<void>());
  const layer = provide(() => {
    calls += 1;
    return Deferred.await(release).pipe(Effect.as([3]));
  });
  await run(layer, prefetchQueryVector("slow"));
  const next = run(layer, queryVector("slow"));
  Effect.runSync(Deferred.succeed(release, undefined));
  expect(await next).toEqual([3]);
  expect(calls).toBe(1);
});

test("the warm-up waits for the worker to connect before embedding", async () => {
  const events: string[] = [];
  const ready = Effect.runSync(Deferred.make<void>());
  const embedded = Effect.runSync(Deferred.make<void>());
  const layer = provide(
    () =>
      Effect.sync(() => events.push("embed")).pipe(
        Effect.andThen(Deferred.succeed(embedded, undefined)),
        Effect.as([5]),
      ),
    Deferred.await(ready).pipe(Effect.andThen(Effect.sync(() => events.push("connected")))),
  );
  const warming = run(layer, warmQueryModel);
  Effect.runSync(Deferred.succeed(ready, undefined));
  await warming;
  await Effect.runPromise(Deferred.await(embedded));
  expect(events).toEqual(["connected", "embed"]);
});
