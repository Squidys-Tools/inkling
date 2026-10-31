import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { generateLibrary } from "./library.ts";

// bun tools/bench/generate.ts <new folder> [--items 1000] [--photos 40] [--seed 1]
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    items: { type: "string", default: "1000" },
    photos: { type: "string", default: "40" },
    seed: { type: "string", default: "1" },
  },
});
const directory = positionals[0];
const items = Number(values.items);
const photos = Number(values.photos);
if (!directory || !Number.isSafeInteger(items) || items < 1 || !(photos >= 1))
  throw new Error(
    "Usage: bun tools/bench/generate.ts <new folder> [--items 1000] [--photos 40] [--seed 1]",
  );

const started = performance.now();
await generateLibrary({ directory: resolve(directory), items, photos, seed: Number(values.seed) });
console.log(
  `bench: wrote ${items} items to ${resolve(directory)} in ${((performance.now() - started) / 1000).toFixed(1)} s`,
);
console.log(`bench: open it with --user-data-dir=${resolve(directory)}`);
