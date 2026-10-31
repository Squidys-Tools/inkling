#!/usr/bin/env bun
// Usage: bun scripts/instance.mjs launch | doctor | cleanup
// Env: INKLING_VERIFY_NAME, INKLING_VERIFY_PORT (9333), INKLING_VERIFY_DIR (<tmpdir>/verify-inkling-run).
// cleanup stops only the pid launch recorded, after confirming its command line,
// then deletes the scratch library. Nothing matches by name.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const command = process.argv[2];
const name = process.env.INKLING_VERIFY_NAME ?? "default";
const port = process.env.INKLING_VERIFY_PORT ?? "9333";
const windows = process.platform === "win32";
const repo = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).stdout.trim();
const run = join(process.env.INKLING_VERIFY_DIR ?? join(tmpdir(), "verify-inkling-run"), name);
const library = join(run, "library");
const pidFile = join(run, "electron.pid");
const logFile = join(run, "electron.log");
const electronBin = join(
  repo,
  "node_modules",
  "electron",
  "dist",
  windows ? "electron.exe" : "electron",
);

const recordedPid = () => (existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : 0);
const alive = (pid) => {
  if (!(pid > 0)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const powershell = (script) =>
  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  }).stdout.trim();

const commandLine = (pid) =>
  windows
    ? powershell(`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`)
    : spawnSync("ps", ["-ww", "-p", String(pid), "-o", "args="], {
        encoding: "utf8",
      }).stdout.trim();
const ownsScratchLibrary = (pid) => alive(pid) && commandLine(pid).includes(library);

// 0 means nothing listens, -1 means something does but ss hides its pid (another user's process).
const portOwner = () => {
  if (windows)
    return Number(
      powershell(
        `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`,
      ),
    );
  const listeners = spawnSync("ss", ["-H", "-ltnp", `sport = :${port}`], {
    encoding: "utf8",
  }).stdout.trim();
  if (!listeners) return 0;
  return Number(/pid=(\d+),/.exec(listeners)?.[1] ?? -1);
};

const appPageListed = async () => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    return (await response.text()).includes("app://local/index.html");
  } catch {
    return false;
  }
};

async function launch() {
  if (!existsSync(join(repo, "dist", "renderer", "index.html"))) {
    console.error("dist/renderer missing: run bun run build:app first");
    process.exit(1);
  }
  if (!existsSync(electronBin)) {
    console.error(
      `electron missing at ${electronBin}: run bun install, then node node_modules/electron/install.js (bun skips Electron's download script)`,
    );
    process.exit(1);
  }
  const busy = portOwner();
  if (busy !== 0) {
    console.error(
      `CDP port ${port} is already owned by ${busy > 0 ? `pid ${busy}` : "another user's process"}, not ours: set INKLING_VERIFY_PORT to a free port`,
    );
    process.exit(1);
  }
  if (ownsScratchLibrary(recordedPid())) {
    console.error(`instance "${name}" is already running (pid ${recordedPid()})`);
    process.exit(1);
  }
  mkdirSync(run, { recursive: true });
  // An occluded window reports visibilityState "hidden" and stops firing animation frames, which
  // strands every motion-gated step (closing the item overlay) until the window is uncovered.
  const args = [
    ".",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${library}`,
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
  ];
  const log = openSync(logFile, "w");
  // Electron-based harnesses (T3 Code, Claude Desktop) export ELECTRON_RUN_AS_NODE, which would
  // make this Electron start as plain Node and crash on `import "electron"`.
  const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
  const options = { cwd: repo, env, detached: true, stdio: ["ignore", log, log] };
  // Linux without a display needs Xvfb. The inner sh records its own pid, then becomes Electron.
  const headless = process.platform === "linux" && !process.env.DISPLAY;
  const child = headless
    ? spawn(
        "xvfb-run",
        [
          "-a",
          "sh",
          "-c",
          'echo $$ > "$0"; shift; exec "$@"',
          pidFile,
          electronBin,
          "--no-sandbox",
          ...args,
        ],
        options,
      )
    : spawn(electronBin, args, options);
  child.unref();
  if (!headless) writeFileSync(pidFile, String(child.pid));

  for (let attempt = 0; attempt < 60; attempt++) {
    if (await appPageListed()) {
      console.log(`ready: pid ${recordedPid() || child.pid}, CDP port ${port}, library ${library}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  console.error(`app page never listed on port ${port}; see ${logFile}`);
  process.exit(1);
}

async function doctor() {
  const pid = recordedPid();
  let failed = false;
  const check = (label, ok) => {
    console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
    if (!ok) failed = true;
  };
  check("pidfile present", pid > 0);
  check("electron pid alive", pid > 0 && alive(pid));
  check("pid runs our scratch data dir", pid > 0 && ownsScratchLibrary(pid));
  check("CDP port owned by our pid", pid > 0 && portOwner() === pid);
  check("app page loaded over CDP", await appPageListed());
  check("library database exists", existsSync(join(library, "library.sqlite3")));
  check("renderer build present", existsSync(join(repo, "dist", "renderer", "index.html")));
  process.exit(failed ? 1 : 0);
}

async function cleanup() {
  const pid = recordedPid();
  if (pid && ownsScratchLibrary(pid)) {
    if (windows) {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      process.kill(pid, "SIGTERM");
      for (let attempt = 0; attempt < 10 && alive(pid); attempt++)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      if (alive(pid)) process.kill(pid, "SIGKILL");
    }
    console.log(`stopped electron pid ${pid}`);
  } else {
    console.log("no live electron owned by this run");
  }
  // Windows releases the SQLite handle a moment after the process dies, so retry on EBUSY.
  for (let attempt = 0; ; attempt++) {
    try {
      rmSync(library, { recursive: true, force: true });
      break;
    } catch (error) {
      if (error.code !== "EBUSY" || attempt === 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  rmSync(pidFile, { force: true });
  console.log(`removed ${library}`);
}

const commands = { launch, doctor, cleanup };
if (!commands[command]) {
  console.error("usage: instance.mjs launch | doctor | cleanup");
  process.exit(2);
}
await commands[command]();
