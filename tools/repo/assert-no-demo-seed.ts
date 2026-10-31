// Fails `bun run build:app` if the web preview's demo seed reaches the app build.
// Checks the built output, not the config, so it holds if the gate is rewritten.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Every file in apps/renderer/src/library/preview/seed-demo starts with one of these,
// and Vite keeps the name in the emitted asset and in the code that imports it.
const SEED_MARKERS = ["compressO-", "saved-clip", "seed-demo"];
const CODE = /\.(?:[cm]?js|css|html)$/;

export function findSeedLeaks(files: string[], read: (path: string) => string) {
  const findings: { path: string; reason: string }[] = [];
  for (const file of files) {
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (SEED_MARKERS.some((marker) => name.startsWith(marker))) {
      findings.push({ path: file, reason: "a seed file was copied into the build" });
    } else if (CODE.test(file)) {
      const marker = SEED_MARKERS.find((candidate) => read(file).includes(candidate));
      if (marker) findings.push({ path: file, reason: `the code still names ${marker}` });
    }
  }
  return findings;
}

function main() {
  const outputs = ["dist/renderer", "dist/desktop"];
  const files = outputs.flatMap((output) => {
    if (!existsSync(output)) {
      console.error(`No build output at ${output}. Run this after \`bun run build:app\`.`);
      process.exit(1);
    }
    return readdirSync(output, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).replaceAll("\\", "/"));
  });
  const findings = findSeedLeaks(files, (path) => readFileSync(path, "utf8"));
  if (findings.length > 0) {
    console.error("The demo seed leaked into the app build:");
    for (const finding of findings) console.error(`  ${finding.path}: ${finding.reason}`);
    console.error(
      "\nThe app must not ship the demo seed. Check the preview gate in\n" +
        "apps/renderer/src/library/connection.ts.",
    );
    process.exit(1);
  }
  console.log(`No demo seed in ${files.length} built files.`);
}

if (import.meta.main) main();
