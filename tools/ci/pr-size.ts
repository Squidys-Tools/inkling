// Labels a PR by its changed source lines, or by its test lines when it changes only tests.
// It reads the diff from the API: pr-size.yml runs on pull_request_target and must not check out PR code.
import { env, gh, type GitHub } from "./github.ts";

type File = { filename: string; additions: number; deletions: number };

const SIZES = [
  { label: "size:XS", below: 10 },
  { label: "size:S", below: 30 },
  { label: "size:M", below: 100 },
  { label: "size:L", below: 500 },
  { label: "size:XL", below: 1000 },
  { label: "size:XXL", below: 5001 },
  { label: "what the hell", below: Infinity },
];
// test-library.ts and friends are test helpers, not source.
const TEST = /(?:^|\/)(?:[^/]+\.(?:test|spec)\.[^/]+|test-[^/]+\.ts)$/;

export function sizeLabel(files: File[]) {
  let source = 0;
  let tests = 0;
  for (const file of files) {
    const lines = file.additions + file.deletions;
    if (TEST.test(file.filename)) tests += lines;
    else source += lines;
  }
  const changed = source || tests;
  return { source, tests, label: SIZES.find((size) => changed < size.below)!.label };
}

export async function syncSizeLabel(api: GitHub, pr: number) {
  const files = await api.list<File>(`repos/{owner}/{repo}/pulls/${pr}/files?per_page=100`);
  const { source, tests, label } = sizeLabel(files);
  const labels = `repos/{owner}/{repo}/issues/${pr}/labels`;
  const current = await api.list<{ name: string }>(`${labels}?per_page=100`);
  for (const { name } of current)
    if (name !== label && SIZES.some((size) => size.label === name))
      await api.send("DELETE", `${labels}/${encodeURIComponent(name)}`);
  if (!current.some(({ name }) => name === label))
    await api.send("POST", labels, { labels: [label] });
  console.log(`PR #${pr}: ${source} source lines, ${tests} test lines, ${label}.`);
}

if (import.meta.main) await syncSizeLabel(gh, Number(env("PR_NUMBER")));
