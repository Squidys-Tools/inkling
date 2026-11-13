// Manage one worktree-scoped verification instance of inkling's desktop app.
// Run `bun .claude/skills/verify-inkling/scripts/instance.ts <command>` from
// anywhere inside the worktree. State is under `.dev/`; evidence is under
// `.artifacts/` and survives cleanup.

import { spawn, spawnSync, type StdioOptions } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import {
  cleanDev,
  devDir,
  listProcesses,
  liveOwned,
  mentionsDev,
  root,
  runHasLiveProcess,
  runStates,
  SETUP_VERIFY_GUID,
  SETUP_VERIFY_NAME,
  type RunState,
} from "./clean-dev.ts";
import { seedLibrary } from "../../../../tools/dev/seeded-library.ts";
import { packSetup } from "../../../../tools/installer/pack.ts";

const takeFlag = (args: string[], flag: string) => {
  const at = args.indexOf(flag);
  return at >= 0 && args.splice(at, 1).length > 0;
};
const takeOption = (args: string[], flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
function fail(message: string): never {
  console.error(`verify-inkling: ${message}`);
  process.exit(1);
}

const currentRun = () => {
  const runs = runStates().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (runs.length === 0) fail("no run found under .dev; start one with `launch`");
  return runs[0];
};

type Window = { id: string; pid: number; title: string };
type SnapshotNode = {
  ref_id?: string;
  role: string;
  name?: string;
  value?: unknown;
  states?: string[];
  available_actions?: string[];
  children?: SnapshotNode[];
};
type Reply<T> = { ok: boolean; data: T; error?: { disposition?: { retry?: string } } };

const agentDesktop = (run: RunState, args: string[], options: { stdio?: StdioOptions } = {}) =>
  spawnSync("agent-desktop", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, AGENT_DESKTOP_HOME: run.agentHome },
    ...options,
  });

// The app's window id comes from list-windows, because several windows can identify as electron.exe.
const ourWindows = (run: RunState): Window[] => {
  const listed = agentDesktop(run, ["list-windows"]);
  if (listed.status !== 0) return [];
  try {
    return (JSON.parse(listed.stdout) as Reply<Window[]>).data.filter(
      (w) => w.pid === run.electronPid,
    );
  } catch {
    return [];
  }
};

// The main window is recorded at launch: a native dialog (e.g. the screenshot screen picker) adds a second window with the same pid.
const findWindowId = (run: RunState) => {
  const windows = ourWindows(run);
  if (run.windowId && windows.some((w) => w.id === run.windowId)) return run.windowId;
  return windows[0]?.id;
};

// WebView2 nests the setup page past agent-desktop's default depth of 10.
const depth = (run: RunState) => (run.installDir ? ["--max-depth", "25"] : []);

// A snapshot is read-only, so a failure agent-desktop marks retry:safe (os error 1175) is repeated.
const snapshotText = (run: RunState, windowId: string) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const snap = agentDesktop(run, [
      "snapshot",
      "--window-id",
      windowId,
      "-i",
      "--compact",
      "--timeout-ms",
      "10000",
      ...depth(run),
    ]);
    if (snap.stdout.includes('"ok":true')) return snap.stdout;
    if (!snap.stdout.includes('"retry":"safe"')) return "";
  }
  return "";
};

const readyMarker = (run: RunState) => (run.seeded ? "Everything" : "Skip");

// A launch argument reaches Windows through cmd.exe, so only plain link characters pass.
const SAFE_LINK = /^inkling:\/\/capture\?url=[\w.~:/=+-]*$/u;

// Returns the pid of the launcher this run owns (cmd.exe on Windows, bun elsewhere); its tree is the app.
const startDetached = (library: string, logPath: string, extraArgs: string[] = []) => {
  const app = ["tools/dev/dev-app.ts", `--user-data-dir=${library}`, ...extraArgs];
  if (process.platform !== "win32") {
    const log = openSync(logPath, "w");
    const child = spawn(process.execPath, app, {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
    });
    child.unref();
    closeSync(log);
    return child.pid!;
  }
  // A plain spawn lets the app inherit the caller's stdout pipe, so any caller reading
  // to EOF hangs for the app's lifetime. Start-Process (ShellExecute) inherits nothing;
  // cmd does the log redirection.
  const inner = `""${process.execPath}" ${app.map((a) => `"${a}"`).join(" ")} > "${logPath}" 2>&1"`;
  const script = `(Start-Process -FilePath 'cmd.exe' -ArgumentList '/d /s /c ${inner.replaceAll("'", "''")}' -WorkingDirectory '${root.replaceAll("'", "''")}' -WindowStyle Hidden -PassThru).Id`;
  const started = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8" },
  );
  const pid = Number(started.stdout.trim());
  if (started.status !== 0 || !Number.isInteger(pid))
    throw new Error(`could not start the app: ${started.stderr}`);
  return pid;
};

const setupVerifyDir = join(root, ".artifacts", "setup-verify");
const unpackedApp = join(root, ".artifacts", "electron", "win-unpacked");

// The real win-unpacked app under another identity: its own appId, guid and uninstall name,
// no inkling:// handler and no shortcuts, so installing it never touches the user's install.
// The package name and shortcut name must differ too: NSIS caches itself in `<name>-updater`,
// and a failed install deletes `<shortcutName>.lnk` even when it creates no shortcuts.
const buildTestNsis = (logPath: string) => {
  const nsisPath = join(setupVerifyDir, "inkling-setup-verify-nsis.exe");
  const asar = join(unpackedApp, "resources", "app.asar");
  if (!existsSync(asar)) throw new Error(`no packaged app at ${unpackedApp}; run \`bun run dist\``);
  const inputs = [asar, join(root, "build", "installer.nsh"), import.meta.path].map(
    (p) => statSync(p).mtimeMs,
  );
  if (existsSync(nsisPath) && statSync(nsisPath).mtimeMs > Math.max(...inputs)) return nsisPath;
  mkdirSync(setupVerifyDir, { recursive: true });
  const build = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).build;
  const config = {
    ...build,
    appId: "com.inkling.setup-verify",
    extraMetadata: { ...build.extraMetadata, name: SETUP_VERIFY_NAME },
    protocols: [],
    directories: { ...build.directories, output: setupVerifyDir },
    win: { ...build.win, artifactName: "inkling-setup-verify-nsis.${ext}" },
    nsis: {
      ...build.nsis,
      guid: SETUP_VERIFY_GUID,
      uninstallDisplayName: "inkling setup verify",
      shortcutName: "inkling setup verify",
      createDesktopShortcut: false,
      createStartMenuShortcut: false,
      runAfterFinish: false,
    },
  };
  const configPath = join(setupVerifyDir, "builder.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  const log = openSync(logPath, "w");
  const built = spawnSync(
    "bun",
    ["x", "electron-builder", "--publish", "never", "--win", "nsis", "--x64"].concat([
      "--prepackaged",
      unpackedApp,
      "--config",
      configPath,
    ]),
    { cwd: root, stdio: ["ignore", log, log] },
  );
  closeSync(log);
  if (built.status !== 0 || !existsSync(nsisPath))
    throw new Error(`test NSIS build failed; see ${logPath}`);
  return nsisPath;
};

// Built with a windows-gnu Rust toolchain the stub imports WebView2Loader.dll and dies at
// startup without it beside the exe (MSVC links the loader statically, as CI ships it).
const deployWebView2Loader = (exe: string) => {
  const buildDir = join(root, ".artifacts", "setup-target", "release", "build");
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const hits = existsSync(buildDir)
    ? readdirSync(buildDir)
        .filter((dir) => dir.startsWith("webview2-com-sys-"))
        .map((dir) => join(buildDir, dir, "out", arch, "WebView2Loader.dll"))
        .filter((dll) => existsSync(dll))
    : [];
  if (hits.length === 0)
    throw new Error(`no WebView2Loader.dll under ${buildDir}; run \`bun run dist\` first`);
  copyFileSync(hits[0], join(dirname(exe), "WebView2Loader.dll"));
};

const launchInstaller = async (flags: string[]) => {
  if (process.platform !== "win32") fail("--installer needs Windows");
  const livePids = new Set(liveOwned().map((p) => p.pid));
  if (runStates().some((s) => runHasLiveProcess(s, livePids)))
    fail("a verification run is already live in this worktree; run `cleanup` first");
  const cleared = await cleanDev();
  if (cleared.removed) console.log(`launch: cleared stale ${devDir}`);

  const runId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const base = join(devDir, "verify-inkling", runId);
  const installDir = join(base, "install");
  // NSIS takes /D= unquoted as the last argument, so the path cannot hold a space.
  if (/\s/u.test(installDir)) fail(`the worktree path has a space; NSIS cannot take ${installDir}`);
  const run: RunState = {
    runId,
    library: join(base, "library"),
    agentHome: join(base, "agent-desktop"),
    evidenceDir: join(root, ".artifacts", "verify-inkling", runId),
    seeded: false,
    startedAt: new Date().toISOString(),
    installDir,
  };
  mkdirSync(run.agentHome, { recursive: true });
  mkdirSync(run.evidenceDir, { recursive: true });
  writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));

  try {
    console.log("launch: test-identity NSIS (cached until win-unpacked changes; log: build.log)");
    const nsisPath = buildTestNsis(join(base, "build.log"));
    const setupExe = join(setupVerifyDir, "inkling-setup-verify.exe");
    await packSetup({ nsisPath, unpackedDir: unpackedApp, outPath: setupExe });
    deployWebView2Loader(setupExe);
    // A file where the install folder belongs makes NSIS fail, for the failed screen.
    if (flags.includes("--fail")) writeFileSync(installDir, "blocks the install folder\n");
    const script = `(Start-Process -FilePath '${setupExe.replaceAll("'", "''")}' -ArgumentList '/D=${installDir.replaceAll("'", "''")}' -PassThru).Id`;
    const started = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          INKLING_SETUP_DEV: base,
        },
      },
    );
    const pid = Number(started.stdout.trim());
    if (started.status !== 0 || !Number.isInteger(pid))
      throw new Error(`could not start the setup window: ${started.stderr}`);
    run.launcherPid = pid;
    run.electronPid = pid;
    writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));

    // A freshly packed 330 MB exe can sit in an antivirus scan before its window appears.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      await Bun.sleep(500);
      if (!listProcesses().some((p) => p.pid === pid))
        throw new Error("the setup window exited early");
      const windowId = findWindowId(run);
      if (windowId && snapshotText(run, windowId).includes('"Install"')) {
        run.windowId = windowId;
        writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));
        console.log(JSON.stringify({ ready: true, ...run }, null, 2));
        return;
      }
    }
    throw new Error("the setup window did not show Install within 90s");
  } catch (error) {
    console.error(`verify-inkling: ${(error as Error).message}; cleaning up the failed launch`);
    await cleanDev().catch((cleanError: Error) =>
      console.error(`verify-inkling: ${cleanError.message}`),
    );
    process.exit(1);
  }
};

// Reads the stub's INKLING_SETUP_DEV samples: the bar at each tenth of the install's real
// duration (an even pace climbs about 10 points a row) and where it ended.
const progressReport = () => {
  const run = currentRun();
  const path = join(dirname(run.library), "progress.log");
  if (!existsSync(path)) fail(`no ${path}; click Install first`);
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/u);
  const samples = lines
    .filter((l) => l.startsWith("sample") || l.startsWith("end"))
    .map((l) => ({
      ms: Number(/ms=(\d+)/u.exec(l)?.[1]),
      bar: Number(/bar=([\d.]+)/u.exec(l)?.[1]),
    }));
  const last = samples.at(-1);
  if (!last) fail("progress.log has no samples yet");
  const ended = lines.some((l) => l.startsWith("end"));
  console.log(
    `${ended ? "finished" : "still running"} after ${(last.ms / 1000).toFixed(1)}s, bar at ${(last.bar * 100).toFixed(0)}%`,
  );
  for (let tenth = 1; tenth <= 10; tenth++) {
    const at = samples.findLast((s) => s.ms <= (last.ms * tenth) / 10) ?? samples[0];
    console.log(
      `  ${String(tenth * 10).padStart(3)}% of the time: bar ${(at.bar * 100).toFixed(0)}%`,
    );
  }
  console.log(`opened: ${lines.includes("open") ? "yes (app not started: dev mode)" : "no"}`);
};

const launch = async (flags: string[]) => {
  if (flags.includes("--installer")) return launchInstaller(flags);
  const linkAt = flags.indexOf("--link");
  const link = linkAt < 0 ? undefined : flags[linkAt + 1];
  if (linkAt >= 0 && !SAFE_LINK.test(link ?? ""))
    fail(`--link needs a plain inkling://capture?url=... link, got ${link ?? "nothing"}`);
  const livePids = new Set(liveOwned().map((p) => p.pid));
  const live = runStates().filter((s) => runHasLiveProcess(s, livePids));
  if (live.length > 0)
    fail("a verification run is already live in this worktree; run `cleanup` first");
  // Stale scratch from an earlier run goes first so `.dev` only ever holds one run.
  const cleared = await cleanDev();
  if (cleared.removed) console.log(`launch: cleared stale ${devDir}`);

  const runId = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
  const base = join(devDir, "verify-inkling", runId);
  const library = join(base, "library");
  const agentHome = join(base, "agent-desktop");
  const evidenceDir = join(root, ".artifacts", "verify-inkling", runId);
  mkdirSync(agentHome, { recursive: true });
  mkdirSync(evidenceDir, { recursive: true });

  const seeded = !flags.includes("--empty");
  const run: RunState = {
    runId,
    library,
    agentHome,
    evidenceDir,
    seeded,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));

  try {
    if (seeded) {
      await seedLibrary(library);
      console.log(`launch: seeded demo library into ${library}`);
    }
    if (!flags.includes("--skip-build")) {
      console.log("launch: bun run build:app (log: build.log)");
      const log = openSync(join(base, "build.log"), "w");
      const built = spawnSync("bun", ["run", "build:app"], {
        cwd: root,
        stdio: ["ignore", log, log],
      });
      closeSync(log);
      if (built.status !== 0) throw new Error(`build:app failed; see ${join(base, "build.log")}`);
    }
    run.launcherPid = startDetached(library, join(base, "electron.log"), link ? [link] : []);
    writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));

    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await Bun.sleep(1000);
      const table = listProcesses();
      if (!table.some((p) => p.pid === run.launcherPid))
        throw new Error(`launcher exited early; see ${join(base, "electron.log")}`);
      const main = table.find(
        (p) =>
          /electron/i.test(p.name || p.command) &&
          mentionsDev(p) &&
          // Off Windows the regex sees the launcher's whole command line, which can name electron.
          !p.command.includes("dev-app.ts") &&
          !p.command.includes("--type="),
      );
      if (!main) continue;
      run.electronPid = main.pid;
      writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));
      const windowId = findWindowId(run);
      if (
        windowId &&
        existsSync(join(library, "library.sqlite3")) &&
        snapshotText(run, windowId).includes(readyMarker(run))
      ) {
        run.windowId = windowId;
        writeFileSync(join(base, "run.json"), JSON.stringify(run, null, 2));
        console.log(JSON.stringify({ ready: true, ...run, windowId }, null, 2));
        return;
      }
    }
    throw new Error("app did not reach a usable window within 120s");
  } catch (error) {
    console.error(`verify-inkling: ${(error as Error).message}; cleaning up the failed launch`);
    await cleanDev().catch((cleanError: Error) =>
      console.error(`verify-inkling: ${cleanError.message}`),
    );
    process.exit(1);
  }
};

// The receiver's port is random, so it is found from this run's Electron listening sockets (a listener has remote port 0).
const receiverPorts = (run: RunState) => {
  if (run.electronPid === undefined) return [];
  const script = `Get-NetTCPConnection -OwningProcess ${run.electronPid} -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.RemotePort -eq 0 } | Select-Object -ExpandProperty LocalPort`;
  const found = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  });
  return found.stdout.split(/\s+/).filter(Boolean).map(Number);
};

// Posts one URL capture the way the browser extension does. The token is read from this run's library and never printed.
const postCapture = async (run: RunState, url: string) => {
  const token = readFileSync(join(run.library, "pairing_token"), "utf8").trim();
  const auth = { Authorization: `Bearer ${token}` };
  for (const port of receiverPorts(run)) {
    const base = `http://127.0.0.1:${port}`;
    const health = await fetch(`${base}/v1/health`, { headers: auth }).catch(() => null);
    if (!health?.ok) continue;
    const posted = await fetch(`${base}/v1/captures`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, kind: "page", url }),
    });
    return { status: posted.status, body: await posted.text() };
  }
  return null;
};

const doctor = () => {
  const run = currentRun();
  const table = new Map(listProcesses().map((p) => [p.pid, p]));
  const checks: { label: string; ok: boolean; detail: string }[] = [];
  const check = (label: string, ok: boolean, detail = "") => checks.push({ label, ok, detail });
  const launcher = run.launcherPid === undefined ? undefined : table.get(run.launcherPid);
  const main = run.electronPid === undefined ? undefined : table.get(run.electronPid);
  if (run.installDir) {
    check(
      "setup window pid alive and owns our .dev path",
      Boolean(main && mentionsDev(main)),
      `pid ${run.electronPid}`,
    );
    const windowId = findWindowId(run);
    check(
      "setup window found via agent-desktop list-windows",
      Boolean(windowId),
      String(windowId ?? ""),
    );
    if (windowId)
      check(
        'setup window snapshot shows "Minimize"',
        snapshotText(run, windowId).includes('"Minimize"'),
      );
    for (const c of checks)
      console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
    console.log(`run ${run.runId}\ninstall ${run.installDir}\nevidence ${run.evidenceDir}`);
    process.exit(checks.every((c) => c.ok) ? 0 : 1);
  }
  check(
    "launcher pid alive and owns our .dev path",
    Boolean(launcher && mentionsDev(launcher)),
    `pid ${run.launcherPid}`,
  );
  check(
    "electron main pid alive and owns our .dev path",
    Boolean(main && mentionsDev(main)),
    `pid ${run.electronPid}`,
  );
  const databasePath = join(run.library, "library.sqlite3");
  let items = -1;
  try {
    const db = new Database(databasePath, { readonly: true });
    db.exec("PRAGMA busy_timeout = 5000");
    items = db
      .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM items WHERE archived = 0")
      .get()!.n;
    db.close();
  } catch (error) {
    check("library database opens read-only", false, (error as Error).message);
  }
  if (items >= 0) check("library database opens read-only", true, `${items} active items`);
  const built = join(root, "dist", "desktop");
  check(
    "dist/desktop build present",
    existsSync(built),
    existsSync(built) ? `built ${statSync(built).mtime.toISOString()}` : built,
  );
  const windowId = findWindowId(run);
  check("window found via agent-desktop list-windows", Boolean(windowId), String(windowId ?? ""));
  if (windowId) {
    const text = snapshotText(run, windowId);
    check(`window snapshot shows "${readyMarker(run)}"`, text.includes(readyMarker(run)));
  }
  for (const c of checks)
    console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? `  (${c.detail})` : ""}`);
  console.log(`run ${run.runId}\nlibrary ${run.library}\nevidence ${run.evidenceDir}`);
  process.exit(checks.every((c) => c.ok) ? 0 : 1);
};

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "launch":
    await launch(rest);
    break;
  case "doctor":
    doctor();
    break;
  case "progress":
    progressReport();
    break;
  case "window": {
    const id = findWindowId(currentRun());
    if (!id) fail("no window for this run's electron pid");
    console.log(id);
    break;
  }
  case "windows": {
    const run = currentRun();
    const main = findWindowId(run);
    for (const w of ourWindows(run))
      console.log(
        `${w.id}  ${w.id === main ? "main" : "other (dialog?)"}  ${JSON.stringify(w.title)}`,
      );
    break;
  }
  case "ad": {
    const run = currentRun();
    const args = rest.map((arg) =>
      arg === "{window}"
        ? (findWindowId(run) ?? fail("no window for this run's electron pid"))
        : arg,
    );
    const out = agentDesktop(run, args, { stdio: "inherit" });
    process.exit(out.status ?? 1);
    break;
  }
  case "ref": {
    // Prints one fresh ref for an exact role+name. Retries only errors agent-desktop marks retry:safe (nothing was delivered).
    const args = [...rest];
    const contains = takeFlag(args, "--contains");
    const within = takeOption(args, "--in");
    const windowOverride = takeOption(args, "--window");
    const [role, ...nameParts] = args;
    const name = nameParts.join(" ");
    if (!role || !name)
      fail(
        'usage: ref <role> <accessible name> [--contains] [--in <ref>] [--window <id>]  e.g. ref button "Save to library"',
      );
    const run = currentRun();
    const id = windowOverride ?? findWindowId(run);
    if (!id) fail("no window for this run's electron pid");
    let last = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const found = agentDesktop(run, [
        "find",
        "--window-id",
        id,
        "--role",
        role,
        "--name",
        name,
        ...(contains ? [] : ["--exact"]),
        ...(within ? ["--root", within] : []),
      ]);
      last = found.stdout || found.stderr;
      try {
        const parsed = JSON.parse(found.stdout) as Reply<{ matches: { ref_id: string }[] }>;
        if (parsed.ok && parsed.data.matches.length === 1) {
          console.log(parsed.data.matches[0].ref_id);
          process.exit(0);
        }
        if (parsed.ok)
          fail(`${parsed.data.matches.length} matches for ${role} "${name}"; narrow it`);
        if (parsed.error?.disposition?.retry !== "safe") break;
      } catch {
        break;
      }
      await Bun.sleep(500);
    }
    fail(`no ref for ${role} "${name}": ${last.slice(0, 300)}`);
    break;
  }
  case "tree": {
    // Flat, greppable view of one snapshot: ref, role, name, value, actions. Extra args pass to `snapshot` (e.g. --surface menu).
    const run = currentRun();
    const args = [...rest];
    const id = takeOption(args, "--window") ?? findWindowId(run);
    if (!id) fail("no window for this run's electron pid");
    type Snapshot = Reply<{ snapshot_id: string; tree: SnapshotNode }>;
    let parsed: Snapshot | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      const snap = agentDesktop(run, [
        "snapshot",
        "--window-id",
        id,
        "-i",
        "--compact",
        "--timeout-ms",
        "10000",
        ...depth(run),
        ...args,
      ]);
      try {
        parsed = JSON.parse(snap.stdout) as Snapshot;
      } catch {
        fail(`snapshot gave no JSON: ${snap.stdout}${snap.stderr}`);
      }
      // A snapshot is read-only, so an error marked retry:safe (e.g. "atomic replace failed") is safe to repeat.
      if (parsed.ok || parsed.error?.disposition?.retry !== "safe") break;
      await Bun.sleep(500);
    }
    if (!parsed?.ok) {
      console.error(JSON.stringify(parsed?.error));
      process.exit(1);
    }
    console.log(`snapshot ${parsed.data.snapshot_id}`);
    const walk = (node: SnapshotNode) => {
      if (node.ref_id) {
        const value = node.value
          ? `  value=${JSON.stringify(String(node.value).slice(0, 120))}`
          : "";
        const states = node.states?.length ? `  states=${node.states.join("|")}` : "";
        console.log(
          `${node.ref_id}  ${node.role}  ${JSON.stringify(node.name ?? "")}${value}${states}  [${(node.available_actions ?? []).filter((a) => a !== "ScrollTo" && a !== "SetFocus").join(",")}]`,
        );
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(parsed.data.tree);
    break;
  }
  case "shot": {
    const run = currentRun();
    const name = rest[0];
    if (!name || !/^[\w.-]+$/.test(name)) fail("usage: shot <name> (letters, digits, dot, dash)");
    const id = findWindowId(run);
    if (!id) fail("no window for this run's electron pid");
    const file = join(run.evidenceDir, name.endsWith(".png") ? name : `${name}.png`);
    const out = agentDesktop(run, ["screenshot", "--window-id", id, file]);
    if (out.status !== 0 || !existsSync(file))
      fail(`screenshot failed: ${out.stdout}${out.stderr}`);
    console.log(file);
    break;
  }
  case "db": {
    const run = currentRun();
    if (!rest[0]) fail('usage: db "<SELECT ...>"');
    const db = new Database(join(run.library, "library.sqlite3"), { readonly: true });
    db.exec("PRAGMA busy_timeout = 5000");
    console.log(JSON.stringify(db.query(rest[0]).all(), null, 2));
    db.close();
    break;
  }
  case "capture": {
    // Feeds a URL to the app through its extension receiver, not the GUI.
    const run = currentRun();
    const url = rest[0];
    if (!url || !/^https?:\/\/\S+$/u.test(url)) fail("usage: capture <http(s) url>");
    if (!liveOwned().some((p) => p.pid === run.electronPid)) fail("this run's app is not running");
    const posted = await postCapture(run, url);
    if (!posted) fail("no extension receiver answered for this run");
    console.log(`${posted.status} ${posted.body}`);
    process.exit(posted.status === 201 ? 0 : 1);
    break;
  }
  case "cleanup": {
    try {
      const result = await cleanDev();
      console.log(`cleanup: ${result.note}`);
    } catch (error) {
      fail((error as Error).message);
    }
    break;
  }
  default:
    console.error(
      "usage: instance.ts launch [--empty] [--skip-build] [--link <inkling://capture?url=...>] | launch --installer [--fail] | doctor | progress | window | windows | ref <role> <name> [--contains] [--in <ref>] [--window <id>] | tree [--window <id>] [snapshot args] | ad <args> | shot <name> | db <sql> | capture <url> | cleanup",
    );
    process.exit(64);
}
