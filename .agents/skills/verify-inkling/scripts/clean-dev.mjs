// Delete the worktree's `.dev/` after checking that no unrelated process uses it.
// `--settle` refuses while a process references it; `--stop` first stops the
// recorded verification processes. Evidence lives under `.artifacts/` and
// survives cleanup.

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const win = process.platform === "win32";
const fold = (value) => (win ? value.toLowerCase().replaceAll("/", "\\") : value);

export const root = resolve(realpathSync(import.meta.dir), "../../../..");
export const devDir = join(root, ".dev");

const withinRoot = (path) => {
  const target = fold(path);
  const base = fold(root);
  return target === base || target.startsWith(base + sep);
};

// Every guard below exists because this script deletes a directory tree.
const assertWorktree = () => {
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

export const listProcesses = () => {
  if (win) {
    const run = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (run.status !== 0) throw new Error(`process listing failed: ${run.stderr}`);
    return [].concat(JSON.parse(run.stdout)).map((p) => ({
      pid: p.ProcessId,
      ppid: p.ParentProcessId,
      name: p.Name ?? "",
      command: p.CommandLine ?? "",
    }));
  }
  const run = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`process listing failed: ${run.stderr}`);
  return run.stdout
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), name: "", command: m[3] }));
};

// A process belongs to this verification only when its command line names the exact `.dev` path.
export const mentionsDev = (process_) => fold(process_.command).includes(fold(devDir));

export const runStates = () => {
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

export const runHasLiveProcess = (run, livePids) =>
  [run.launcherPid, run.electronPid].some((pid) => livePids.has(pid));

// Recorded pids that are still alive AND still carry the .dev path: a recycled pid never matches.
export const liveOwned = () => {
  const table = new Map(listProcesses().map((p) => [p.pid, p]));
  const recorded = runStates().flatMap((s) => [s.launcherPid, s.electronPid]);
  return [...new Set(recorded)]
    .map((pid) => table.get(pid))
    .filter((p) => p && p.pid !== process.pid && mentionsDev(p));
};

// Detection only, never a kill list: anything else naming .dev blocks removal.
export const strays = () => listProcesses().filter((p) => p.pid !== process.pid && mentionsDev(p));

const kill = (pid, force) => {
  if (win) spawnSync("taskkill", ["/PID", String(pid), "/T", ...(force ? ["/F"] : [])]);
  else
    try {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    } catch {}
};

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export const stopOwned = async () => {
  const owned = liveOwned();
  for (const force of [false, true]) {
    for (const p of owned) if (liveOwned().some((q) => q.pid === p.pid)) kill(p.pid, force);
    const deadline = Date.now() + (force ? 10_000 : 4_000);
    while (Date.now() < deadline && liveOwned().length > 0) await sleep(250);
    if (liveOwned().length === 0) return;
  }
};

/** @param {"stop" | "settle"} mode */
export const cleanDev = async (mode) => {
  assertWorktree();
  if (!existsSync(devDir)) return { removed: false, note: "no .dev directory; nothing to clean" };
  if (mode === "stop") await stopOwned();
  const blocking = strays();
  if (blocking.length > 0) {
    const list = blocking.map((p) => `${p.pid} (${p.name || p.command.slice(0, 60)})`).join(", ");
    throw new Error(
      `refusing to delete .dev: ${blocking.length} process(es) still reference it: ${list}. ` +
        (mode === "settle"
          ? "Settle cleanup never kills; stop the verification run first with instance.mjs cleanup."
          : "Close them yourself (they were not stopped by pid), then rerun."),
    );
  }
  rmSync(devDir, { recursive: true, force: true });
  if (existsSync(devDir)) throw new Error(`.dev still exists after removal: ${devDir}`);
  return { removed: true, note: `removed ${devDir}` };
};

if (import.meta.main) {
  const flag = process.argv[2];
  if (flag !== "--stop" && flag !== "--settle") {
    console.error("usage: clean-dev.mjs --settle | --stop");
    process.exit(64);
  }
  try {
    const result = await cleanDev(flag === "--stop" ? "stop" : "settle");
    console.log(`clean-dev: ${result.note}`);
  } catch (error) {
    console.error(`clean-dev: ${error.message}`);
    process.exit(1);
  }
}
