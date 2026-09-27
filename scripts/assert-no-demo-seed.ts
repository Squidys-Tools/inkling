// Build guard for the demo seed. vite.config.ts drops public/seed-demo/ and
// the src/seedPersonal.ts bundle from `--mode app` builds, and this asserts the
// result, so a refactor that quietly reintroduces the seed fails the build
// instead of shipping ~10 MB of content no user asked for.
//
// Checks the built output rather than the config, so it stays honest even if
// the exclusion mechanism is rewritten. Run by `bun run build:app`.
//
// Detection logic is exported separately from the filesystem walk so it can be
// covered by tests without a real build.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** A path under dist/ that must not exist in a shipped build. */
const FORBIDDEN_PATHS = ["seed-demo"];

/**
 * A substring that only appears in bundled seed code. Every demo asset URL in
 * src/seedPersonal.ts is rooted at /seed-demo/, and nothing else in src/ refers
 * to that path, so its presence in a JS asset means the seed module shipped.
 */
const SEED_CODE_MARKER = "/seed-demo/";

type Finding = { path: string; reason: string };

function walk(root: string, base = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full, base));
    else files.push(relative(base, full).split("\\").join("/"));
  }
  return files;
}

/**
 * Reports every way the seed can still be reachable in a built app. Exported
 * for tests; takes the file list and readers so it needs no real dist.
 */
export function findSeedLeaks(
  files: string[],
  exists: (path: string) => boolean,
  read: (path: string) => string,
): Finding[] {
  const findings: Finding[] = [];

  for (const forbidden of FORBIDDEN_PATHS) {
    if (exists(forbidden)) {
      findings.push({ path: forbidden, reason: "seed assets were copied into the build" });
    }
  }

  for (const file of files) {
    if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
    if (read(file).includes(SEED_CODE_MARKER)) {
      findings.push({ path: file, reason: `bundled code still references ${SEED_CODE_MARKER}` });
    }
  }

  return findings;
}

function main(): void {
  const dist = join(process.cwd(), "dist");
  if (!existsSync(dist)) {
    console.error(`No build output at ${dist}. Run this after \`vite build --mode app\`.`);
    process.exit(1);
  }
  const files = walk(dist);
  const findings = findSeedLeaks(
    files,
    (path) => {
      try {
        return statSync(join(dist, path)).isDirectory();
      } catch {
        return false;
      }
    },
    (path) => readFileSync(join(dist, path), "utf8"),
  );

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
