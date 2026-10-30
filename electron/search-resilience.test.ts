import { expect, test } from "bun:test";
import { createLatestQuery } from "./latest-query";
import { createRendererRecovery } from "./renderer-recovery";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("rapid typing keeps one inference and only the newest waiting query", async () => {
  const gates = [deferred<string>(), deferred<string>()];
  const calls: string[] = [];
  const query = createLatestQuery(
    (text) => {
      calls.push(text);
      return gates[calls.length - 1].promise;
    },
    () => "lexical-only",
  );
  const first = query("first");
  const superseded = Array.from({ length: 60 }, (_, i) => query(`typing-${i}`));
  const newest = query("newest");
  expect(calls).toEqual(["first"]);
  expect(await Promise.all(superseded)).toEqual(Array(60).fill("lexical-only"));
  gates[0].resolve("first-vector");
  expect(await first).toBe("first-vector");
  await Promise.resolve();
  expect(calls).toEqual(["first", "newest"]);
  gates[1].resolve("newest-vector");
  expect(await newest).toBe("newest-vector");
});

test("model crash rejects that query but releases the next one", async () => {
  const query = createLatestQuery(
    async (text) => {
      if (text === "crash") throw new Error("worker exited");
      return text;
    },
    () => "fallback",
  );
  const failed = query("crash");
  const next = query("still usable");
  await expect(failed).rejects.toThrow("worker exited");
  expect(await next).toBe("still usable");
});

test("native renderer/GPU recovery stops a repeated crash loop and expires old attempts", () => {
  let time = 100;
  const recovery = createRendererRecovery(() => time);
  expect(recovery.admit()).toBe(true);
  expect(recovery.admit()).toBe(true);
  expect(recovery.admit()).toBe(false);
  time += 60_000;
  expect(recovery.admit()).toBe(true);
});
