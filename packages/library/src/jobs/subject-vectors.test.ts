import { expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { subjectPrompt } from "../storage/visual-subject.ts";
import { makeSubjectVectors } from "./subject-vectors.ts";
import { JobsWorker, type WorkerClient } from "./worker-client.ts";

test("repeated normalized description preserves prompt identity and bounded eviction", async () => {
  const embedded: string[] = [];
  const worker = {
    embedQuery: ({ text }: { text: string }) =>
      Effect.sync(() => {
        embedded.push(text);
        return [0, 1];
      }),
  } as unknown as WorkerClient;
  const layer = Layer.succeed(JobsWorker, {
    client: Effect.succeed(worker),
    connected: Effect.void,
  });
  const { loadPhotoSearchVectors } = makeSubjectVectors();
  const load = (query: string) =>
    Effect.runPromise(Effect.provide(loadPhotoSearchVectors(query), layer));

  const base = await load("cat");
  const first = await load("a copper teapot");
  expect(first).not.toBe(base);
  expect(await load("  A COPPER TEAPOT  ")).toBe(first);
  expect(embedded.filter((text) => text === subjectPrompt("a copper teapot"))).toHaveLength(1);
  expect(base?.has("a copper teapot")).toBe(false);
  for (let index = 0; index < 32; index++) await load(`abstract object ${index}`);
  expect(await load("a copper teapot")).not.toBe(first);
});
