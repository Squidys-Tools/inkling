// Delete the worktree's `.dev/` after stopping the verification processes its runs recorded.
// Refuses if any other process still references `.dev`. Each run's build and Electron logs are
// copied into its evidence folder first. Evidence lives under `.artifacts/` and survives cleanup.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const win = process.platform === "win32";
export const fold = (value: string) => (win ? value.toLowerCase().replaceAll("/", "\\") : value);

export const root = resolve(realpathSync(import.meta.dir), "../../../..");
export const devDir = join(root, ".dev");

const withinRoot = (path: string) => {
  const target = fold(path);
  const base = fold(root);
  return target === base || target.startsWith(base + sep);
};

// Every guard below exists because this script deletes a directory tree.
export const assertWorktree = () => {
  if (!existsSync(join(root, ".git")) || !existsSync(join(root, "t3.json")))
    throw new Error(`refusing: ${root} is not an inkling worktree root`);
  if (!withinRoot(realpathSync(process.cwd())))
    throw new Error(`refusing: cwd ${process.cwd()} is outside the worktree ${root}`);
  if (existsSync(devDir)) {
    const info = lstatSync(devDir);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(`refusing: ${devDir} is not a plain directory`);
  }
};

export type Process = { pid: number; name: string; command: string };
export type RunState = {
  runId: string;
  library: string;
  agentHome: string;
  evidenceDir: string;
  seeded: boolean;
  startedAt: string;
  launcherPid?: number;
  electronPid?: number;
  windowId?: string;
  // Set by `launch --installer`: the setup window is the "electron" pid, and the
  // test-identity app installs here until cleanup uninstalls it.
  installDir?: string;
};

// The test-identity installer's fixed NSIS guid, so cleanup can confirm its registry keys are gone.
export const SETUP_VERIFY_GUID = "bbf65adc-c826-4291-bfd0-9e266345089d";
const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${SETUP_VERIFY_GUID}`;
const locationKey = `HKCU\\Software\\${SETUP_VERIFY_GUID}`;

export const listProcesses = (): Process[] => {
  if (win) {
    const run = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (run.status !== 0) throw new Error(`process listing failed: ${run.stderr}`);
    type CimProcess = {
      ProcessId: number;
      Name: string | null;
      CommandLine: string | null;
    };
    // ConvertTo-Json prints a lone object, not an array, when only one process matches.
    return ([] as CimProcess[]).concat(JSON.parse(run.stdout)).map((p) => ({
      pid: p.ProcessId,
      name: p.Name ?? "",
      command: p.CommandLine ?? "",
    }));
  }
  const run = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`process listing failed: ${run.stderr}`);
  return run.stdout
    .split("\n")
    .flatMap((line) => {
      const m = line.match(/^\s*(\d+)\s+(.*)$/);
      return m ? [m] : [];
    })
    .map((m) => ({ pid: Number(m[1]), name: "", command: m[2] }));
};

// `.dev-library` (dev:app's scratch library) starts with the same text, so the match must end at a path boundary.
export const mentionsDev = (process_: Process) => {
  const command = fold(process_.command);
  const dir = fold(devDir);
  for (let at = command.indexOf(dir); at !== -1; at = command.indexOf(dir, at + 1)) {
    const next = command[at + dir.length];
    if (next === undefined || !/[\w.-]/.test(next)) return true;
  }
  return false;
};

export const runStates = (): RunState[] => {
  const parent = join(devDir, "verify-inkling");
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        return [JSON.parse(readFileSync(join(parent, entry.name, "run.json"), "utf8"))];
      } catch {
        return [];
      }
    });
};

export const runHasLiveProcess = (run: Partial<RunState>, livePids: Set<number>) =>
  [run.launcherPid, run.electronPid].some((pid) => pid !== undefined && livePids.has(pid));

// Recorded pids that are still alive AND still carry the .dev path: a recycled pid never matches.
export const liveOwned = () => {
  const table = new Map(listProcesses().map((p) => [p.pid, p]));
  const recorded = runStates()
    .flatMap((s) => [s.launcherPid, s.electronPid])
    .filter((pid) => pid !== undefined);
  return [...new Set(recorded)]
    .flatMap((pid) => table.get(pid) ?? [])
    .filter((p) => p.pid !== process.pid && mentionsDev(p));
};

// Detection only, never a kill list: anything else naming .dev blocks removal.
const strays = () => listProcesses().filter((p) => p.pid !== process.pid && mentionsDev(p));

const kill = (pid: number, force: boolean) => {
  if (win) spawnSync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])]);
  else
    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    } catch {}
};

export const stopOwned = async () => {
  const owned = liveOwned();
  for (const force of [false, true]) {
    for (const p of owned) if (liveOwned().some((q) => q.pid === p.pid)) kill(p.pid, force);
    const deadline = Date.now() + (force ? 10_000 : 4_000);
    while (Date.now() < deadline && liveOwned().length > 0) await Bun.sleep(250);
    if (liveOwned().length === 0) return;
  }
};

// The logs are the only record of a failed launch, so they are copied into the run's evidence folder first.
const keepLogs = () => {
  for (const run of runStates()) {
    if (!existsSync(run.evidenceDir)) continue;
    for (const name of ["build.log", "electron.log", "progress.log"]) {
      const source = join(dirname(run.library), name);
      if (existsSync(source)) copyFileSync(source, join(run.evidenceDir, name));
    }
  }
};

// `_?=` runs the uninstaller in place and synchronously; without it NSIS copies
// itself to %TEMP% and returns at once.
// A failed install (`launch --installer --fail`) removes its own keys in build/installer.nsh,
// so a key that survives here is a regression, not something to delete.
const uninstallTestApp = () => {
  if (!win) return;
  const registered = () =>
    [uninstallKey, locationKey].some(
      (key) => spawnSync("reg", ["query", key], { stdio: "ignore" }).status === 0,
    );
  for (const run of runStates()) {
    if (!run.installDir) continue;
    const uninstaller = join(run.installDir, "Uninstall inkling.exe");
    if (!existsSync(uninstaller)) continue;
    spawnSync(uninstaller, ["/S", `_?=${run.installDir}`], { stdio: "ignore", timeout: 120_000 });
  }
  if (registered())
    throw new Error(
      `the test install is still registered (${uninstallKey} or ${locationKey}); its uninstaller did not finish`,
    );
};

// Shared by `cleanup`, `launch` and the worktree's settle action: stop what our runs recorded, then delete `.dev`.
export const cleanDev = async () => {
  assertWorktree();
  if (!existsSync(devDir)) return { removed: false, note: "no .dev directory; nothing to clean" };
  await stopOwned();
  uninstallTestApp();
  const blocking = strays();
  if (blocking.length > 0) {
    const list = blocking.map((p) => `${p.pid} (${p.name || p.command.slice(0, 60)})`).join(", ");
    throw new Error(
      `refusing to delete .dev: ${blocking.length} process(es) still reference it: ${list}. ` +
        "They were not recorded by a verification run, so close them yourself, then rerun.",
    );
  }
  keepLogs();
  rmSync(devDir, { recursive: true, force: true });
  if (existsSync(devDir)) throw new Error(`.dev still exists after removal: ${devDir}`);
  return { removed: true, note: `removed ${devDir}` };
};

// The old settle action ran this file with --settle. Fail loudly so that action cannot look like a success.
if (import.meta.main) {
  console.error(
    "clean-dev.ts has no settle command; the worktree action is `bun tools/repo/clean-worktree.ts` (Clean up worktree).",
  );
  process.exit(1);
}
