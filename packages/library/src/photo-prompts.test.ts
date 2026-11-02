import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Duration, Effect } from "effect";
import { photoSearchLabels, photoSearchSubjects } from "./storage/photo-search.ts";
import { subjectPrompt } from "./storage/visual-subject.ts";

// Exercise the actual loader without starting the Electron library process.
const source = readFileSync(new URL("./process.ts", import.meta.url), "utf8");
const loaderSource = source.slice(
  source.indexOf("let photoPrompts:"),
  source.indexOf("// Every failure"),
);
function loader() {
  let calls = 0;
  const base = new Map(photoSearchLabels.map((label) => [label, [1, 0]]));
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(loaderSource);
  const load = new Function(
    "Effect",
    "photoSearchLabels",
    "photoSearchSubjects",
    "loadSubjectVectors",
    "queryVector",
    "subjectPrompt",
    "subjectWait",
    `${code}\nreturn loadPhotoSearchVectors;`,
  )(
    Effect,
    photoSearchLabels,
    photoSearchSubjects,
    Effect.succeed(base),
    () => {
      calls++;
      return Effect.succeed([0, 1]);
    },
    subjectPrompt,
    Duration.seconds(1),
  ) as (query: string) => Effect.Effect<ReadonlyMap<string, ArrayLike<number>> | null>;
  return { load, base, calls: () => calls };
}

test("repeated normalized description preserves prompt identity and bounded eviction", async () => {
  const { load, base, calls } = loader();
  const first = await Effect.runPromise(load("a copper teapot"));
  expect(first).not.toBe(base);
  expect(await Effect.runPromise(load("  A COPPER TEAPOT  "))).toBe(first);
  expect(calls()).toBe(1);
  expect(base.has("a copper teapot")).toBe(false);
  for (let index = 0; index < 32; index++)
    await Effect.runPromise(load(`abstract object ${index}`));
  expect(await Effect.runPromise(load("a copper teapot"))).not.toBe(first);
});
