// dev:app's launcher: the app runs against the worktree's .dev-library/,
// seeded on first run; --user-data-dir skips seeding. The stock binary runs
// unrenamed: a renamed exe makes Electron report app.isPackaged, which would
// register the inkling:// handler in dev.

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
// electron/index.js downloads the binary on first use; its default export is the path.
const executable = (await import("electron")).default as unknown as string;
const env = { ...process.env };
// Harnesses set ELECTRON_RUN_AS_NODE to reuse the binary as plain Node; an
// inherited copy makes the app exit at startup.
delete env.ELECTRON_RUN_AS_NODE;
// Renderer console messages reach the terminal.
env.ELECTRON_ENABLE_LOGGING ??= "1";
const app = Bun.spawn(
  [executable, ".", "--enable-logging", `--user-data-dir=${directory}`, ...rest],
  {
    stdio: ["inherit", "inherit", "inherit"],
    cwd: repo,
    env,
  },
);
process.exitCode = await app.exited;
