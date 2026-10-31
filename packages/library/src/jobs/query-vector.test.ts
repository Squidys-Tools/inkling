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

test("an embed outlives a caller that stopped waiting and fills the cache", async () => {
  let calls = 0;
  const layer = provide(() => {
    calls += 1;
    return Effect.sleep("2300 millis").pipe(Effect.as([3]));
  });
  expect(await run(layer, queryVector("slow"))).toBeNull();
  await Bun.sleep(500);
  expect(await run(layer, queryVector("slow"))).toEqual([3]);
  expect(calls).toBe(1);
}, 8000);

test("a prefetch and the query after it share one embed", async () => {
  let calls = 0;
  const layer = provide(() => {
    calls += 1;
    return Effect.sleep("50 millis").pipe(Effect.as([4]));
  });
  await run(layer, prefetchQueryVector("shared"));
  expect(await run(layer, queryVector("shared"))).toEqual([4]);
  expect(calls).toBe(1);
});

test("the warm-up waits for the worker to connect before embedding", async () => {
  let calls = 0;
  const ready = Effect.runSync(Deferred.make<void>());
  const layer = provide(() => {
    calls += 1;
    return Effect.succeed([5]);
  }, Deferred.await(ready));
  const warming = run(layer, warmQueryModel);
  await Bun.sleep(20);
  expect(calls).toBe(0);
  Effect.runSync(Deferred.succeed(ready, undefined));
  await warming;
  await Bun.sleep(20);
  expect(calls).toBe(1);
});
