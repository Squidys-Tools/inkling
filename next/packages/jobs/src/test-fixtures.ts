import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A file from the benchmark corpus, copied here so tests run from any directory. */
export const fixturePath = (name: string) => join(import.meta.dir, "fixtures", name);
export const fixture = (name: string) => readFileSync(fixturePath(name));
