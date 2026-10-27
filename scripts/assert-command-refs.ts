// Fails when the docs, t3.json, or contributor files name a `bun run <script>`
// that package.json no longer defines. docs/changelog.md is exempt, and
// `bun run --cwd` scripts belong to their workspace.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DOC_ROOTS = ["AGENTS.md", "README.md", "CONTRIBUTING.md", "t3.json", "docs"];
const EXEMPT_FILES = new Set(["docs/changelog.md"]);
const COMMAND_REF = /\bbun run (?!--)([\w:-]+)/g;

type Finding = { file: string; line: number; script: string };

export function findBrokenCommandRefs(
  documents: { file: string; text: string }[],
  scripts: Set<string>,
): Finding[] {
  const findings: Finding[] = [];
  for (const { file, text } of documents) {
    if (EXEMPT_FILES.has(file)) continue;
    text.split("\n").forEach((line, index) => {
      for (const match of line.matchAll(COMMAND_REF)) {
        const script = match[1];
        if (!scripts.has(script)) findings.push({ file, line: index + 1, script });
      }
    });
  }
  return findings;
}

function docsUnder(root: string, path: string): string[] {
  if (!statSync(join(root, path)).isDirectory()) return [path];
  return readdirSync(join(root, path)).flatMap((entry) => docsUnder(root, `${path}/${entry}`));
}

function main(): void {
  const root = process.cwd();
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const documents = DOC_ROOTS.flatMap((path) => docsUnder(root, path))
    .filter((file) => /\.(md|json)$/.test(file))
    .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));
  const findings = findBrokenCommandRefs(documents, new Set(Object.keys(pkg.scripts)));

  if (findings.length > 0) {
    console.error("Documented commands that package.json does not define:");
    for (const finding of findings) {
      console.error(`  ${finding.file}:${finding.line}: bun run ${finding.script}`);
    }
    console.error("\nRename the reference to the current script, or restore the script.");
    process.exit(1);
  }

  console.log(`All documented bun run commands exist in package.json (${documents.length} files).`);
}

if (import.meta.main) main();
