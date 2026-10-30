// Fails `bun run build:app` if the demo seed reaches the app bundle. Checks the
// built output, not the config, so it holds if the exclusion is rewritten.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SEED_DIRECTORY = "seed-demo";
// Every demo asset URL in src/seedPersonal.ts is rooted at /seed-demo/ and nothing
// else in src/ refers to that path, so built code containing it shipped the seed.
const SEED_CODE_MARKER = `/${SEED_DIRECTORY}/`;

export function findSeedLeaks(files: string[], read: (path: string) => string) {
  const findings: { path: string; reason: string }[] = [];
  if (files.some((file) => file === SEED_DIRECTORY || file.startsWith(`${SEED_DIRECTORY}/`))) {
    findings.push({ path: SEED_DIRECTORY, reason: "seed assets were copied into the build" });
  }
  for (const file of files) {
    if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
    if (read(file).includes(SEED_CODE_MARKER)) {
      findings.push({ path: file, reason: `bundled code still references ${SEED_CODE_MARKER}` });
    }
  }
  return findings;
}

function main() {
  const dist = join(process.cwd(), "dist");
  if (!existsSync(dist)) {
    console.error(`No build output at ${dist}. Run this after \`vite build --mode app\`.`);
    process.exit(1);
  }
  const files = readdirSync(dist, { recursive: true, encoding: "utf8" }).map((file) =>
    file.replaceAll("\\", "/"),
  );
  const findings = findSeedLeaks(files, (path) => readFileSync(join(dist, path), "utf8"));

  if (findings.length > 0) {
    console.error("Demo seed leaked into the app build:");
    for (const finding of findings) {
      console.error(`  dist/${finding.path}: ${finding.reason}`);
    }
    console.error(
      "\nA shipped build must not contain the demo seed. Check the `--mode app`\n" +
        "exclusion in vite.config.ts and the conditional glob in src/App.tsx.",
    );
    process.exit(1);
  }

  console.log(`No demo seed in ${files.length} built files.`);
}

if (import.meta.main) main();
