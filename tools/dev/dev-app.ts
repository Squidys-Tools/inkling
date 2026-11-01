// dev:app's launcher: the app runs against the worktree's .dev-library/,
// seeded with the web preview's demo data on first run, so no dev run can
// stamp the real library. An explicit --user-data-dir is used as-is, never
// seeded. Delete .dev-library/ to reseed.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedLibrary } from "./seeded-library.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "../..");
let override: string | undefined;
const rest: string[] = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === "--user-data-dir") override = args[++index];
  else if (arg.startsWith("--user-data-dir=")) override = arg.slice(arg.indexOf("=") + 1);
  else rest.push(arg);
}
const directory = override ? resolve(repo, override) : join(repo, ".dev-library");
if (!override && (await seedLibrary(directory)))
  console.log(`dev: seeded the demo library into ${directory}`);
const electron = (await import("electron")).default as unknown as string;
// Harnesses set ELECTRON_RUN_AS_NODE to reuse the binary as plain Node; an
// inherited copy makes the app exit at startup.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = Bun.spawn([electron, ".", "--dev", `--user-data-dir=${directory}`, ...rest], {
  stdio: ["inherit", "inherit", "inherit"],
  cwd: repo,
  env,
});
process.exitCode = await app.exited;
