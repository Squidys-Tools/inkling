import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Library, libraryLayer } from "../../packages/library/src/storage/library.ts";
import { generateLibrary } from "./library.ts";

// How long the library process takes to answer the first page of cards, measured
// on its storage layer directly. The plan's budget: under 50 ms at 10,000 items.
const budgetMillis = 50;
const { values } = parseArgs({
  options: {
    items: { type: "string", default: "10000" },
    limit: { type: "string", default: "100" },
    repeats: { type: "string", default: "20" },
  },
});
const items = Number(values.items);
const limit = Number(values.limit);
const repeats = Number(values.repeats);

const directory = await mkdtemp(join(tmpdir(), "inkling-first-page-"));
try {
  await generateLibrary({ directory, items, assets: false });
  const timings = await Effect.runPromise(
    Effect.gen(function* () {
      const library = yield* Library;
      const firstPage = Effect.gen(function* () {
        const started = performance.now();
        const page = yield* library.cardsPage(false, null, limit);
        return { millis: performance.now() - started, cards: page.cards.length, total: page.total };
      });
      const cold = yield* firstPage;
      const warm: number[] = [];
      for (let run = 0; run < repeats; run++) warm.push((yield* firstPage).millis);
      return { cold, warm: warm.sort((a, b) => a - b) };
    }).pipe(
      Effect.provide(
        libraryLayer({ databasePath: join(directory, "library.sqlite3"), appVersion: "bench" }),
      ),
    ),
  );
  const median = timings.warm[Math.floor(timings.warm.length / 2)];
  const worst = timings.warm.at(-1) ?? 0;
  console.log(
    `first page: ${timings.cold.cards} of ${timings.cold.total} active cards (limit ${limit})`,
  );
  console.log(`  cold   ${timings.cold.millis.toFixed(1)} ms`);
  console.log(
    `  median ${median.toFixed(1)} ms over ${repeats} runs, worst ${worst.toFixed(1)} ms`,
  );
  const within = timings.cold.millis < budgetMillis;
  console.log(`  budget ${budgetMillis} ms: ${within ? "met" : "MISSED"} (cold read)`);
  process.exitCode = within ? 0 : 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
