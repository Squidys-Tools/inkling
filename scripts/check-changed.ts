// Fast pre-push subset of CI for what this branch changed. `bun run check` is the full mirror.
// Usage: bun run check:changed [base-ref]  (default: merge-base with origin/main)

import { existsSync } from "node:fs";

const CODE = /\.[cm]?[jt]sx?$/;
const FORMATTABLE = /\.(?:[cm]?[jt]sx?|jsonc?|css|html)$/;
const TSCONFIG = /(?:^|\/)tsconfig[^/]*\.json$/;

async function git(...args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "ignore" });
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { out: out.trim(), code };
}

function lines(text: string) {
  return text ? text.split(/\r?\n/) : [];
}

const mergeBase = await git("merge-base", "HEAD", Bun.argv[2] ?? "origin/main");
if (mergeBase.code !== 0 || !mergeBase.out) {
  console.error("No merge base found. Run `git fetch origin` or pass a ref.");
  process.exit(1);
}

const [diff, untracked] = await Promise.all([
  git("diff", "--name-only", "--no-renames", mergeBase.out),
  git("ls-files", "--others", "--exclude-standard"),
]);
const changed = [...new Set([...lines(diff.out), ...lines(untracked.out)])]
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => existsSync(file));

if (changed.length === 0) {
  console.log("No changes to check.");
  process.exit(0);
}

const code = changed.filter((file) => CODE.test(file));
const tests = new Set<string>();
for (const file of code) {
  if (/\.test\.[jt]sx?$/.test(file)) tests.add(file);
  else {
    const stem = file.replace(CODE, "");
    for (const ext of ["ts", "tsx"]) {
      if (existsSync(`${stem}.test.${ext}`)) tests.add(`${stem}.test.${ext}`);
    }
  }
}
const touches = (...names: string[]) =>
  changed.some((file) => names.includes(file) || TSCONFIG.test(file));

const steps: { name: string; cmd: string[] }[] = [];
if (code.length)
  steps.push({
    name: "oxlint",
    cmd: ["bun", "x", "oxlint", "--no-error-on-unmatched-pattern", ...code],
  });
const formattable = changed.filter((file) => FORMATTABLE.test(file));
if (formattable.length) {
  steps.push({
    name: "oxfmt",
    cmd: ["bun", "x", "oxfmt", "--check", "--no-error-on-unmatched-pattern", ...formattable],
  });
}
if (tests.size)
  steps.push({ name: "test", cmd: ["bun", "test", ...[...tests].map((t) => `./${t}`)] });
if (code.length || touches("package.json", "knip.json")) {
  steps.push({ name: "knip", cmd: ["bun", "run", "knip"] });
}
if (code.length || touches("package.json")) {
  steps.push({ name: "typecheck", cmd: ["bun", "run", "typecheck"] });
}

// Ignore patterns can leave a tool with no targets; that must not fail the run.
if (steps.length === 0) console.log("No checks apply to these files.");

const results = await Promise.all(
  steps.map(async ({ name, cmd }) => {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    const [out, err, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    console.log(`\n=== ${name} ${exit === 0 ? "ok" : "FAILED"} ===\n${(out + err).trim()}`);
    return { name, ok: exit === 0 };
  }),
);

console.log(`\n${changed.length} changed file(s)`);
for (const { name, ok } of results) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
