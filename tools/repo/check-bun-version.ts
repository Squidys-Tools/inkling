import { readFileSync } from "node:fs";

const expected = readFileSync(".bun-version", "utf8").trim();
if (Bun.version !== expected) {
  console.error(`Expected Bun ${expected}, found ${Bun.version}`);
  process.exit(1);
}
console.log(`Bun ${Bun.version} matches .bun-version`);
