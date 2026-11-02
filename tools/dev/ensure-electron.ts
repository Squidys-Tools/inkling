// The electron package ships no lifecycle script, so `bun install` never
// downloads its binary. @electron/get reuses the machine's download cache, so
// only the first worktree on a machine waits on the network.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const platformExecutable =
  process.platform === "win32"
    ? "electron.exe"
    : process.platform === "darwin"
      ? "Electron.app/Contents/MacOS/Electron"
      : "electron";

export function ensureElectron() {
  const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), "index.js"));
  const electronDir = dirname(require.resolve("electron/package.json"));
  const executable = join(electronDir, "dist", platformExecutable);
  if (!Bun.file(executable).exists()) {
    console.log(
      "dev: downloading the Electron binary (about 120 MB, cached for other worktrees)...",
    );
    const install = Bun.spawnSync([process.execPath, join(electronDir, "install.js")], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (install.exitCode !== 0) throw new Error("Could not download the Electron binary.");
  }
  return executable;
}

if (import.meta.main) ensureElectron();
