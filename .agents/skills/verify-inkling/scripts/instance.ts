// Manage one worktree-scoped verification instance of inkling's desktop app.
// Run `bun .claude/skills/verify-inkling/scripts/instance.ts <command>` from
// anywhere inside the worktree. State is under `.dev/`; evidence is under
// `.artifacts/` and survives cleanup.

import { spawn, spawnSync, type StdioOptions } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import {
  cleanDev,
  devDir,
  listProcesses,
  liveOwned,
  mentionsDev,
  root,
  runHasLiveProcess,
  runStates,
  type RunState,
} from "./clean-dev.ts";
import { seedLibrary } from "../../../../tools/dev/seeded-library.ts";

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

// The main window is recorded at launch: a native dialog (e.g. delete confirmation) adds a second window with the same pid.
const findWindowId = (run: RunState) => {
  const windows = ourWindows(run);
  if (run.windowId && windows.some((w) => w.id === run.windowId)) return run.windowId;
  return windows[0]?.id;
};

const snapshotText = (run: RunState, windowId: string) => {
  const snap = agentDesktop(run, [
    "snapshot",
    "--window-id",
    windowId,
    "-i",
    "--compact",
    "--timeout-ms",
    "10000",
  ]);
  return snap.status === 0 ? snap.stdout : "";
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

const launch = async (flags: string[]) => {
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
      "usage: instance.ts launch [--empty] [--skip-build] [--link <inkling://capture?url=...>] | doctor | window | windows | ref <role> <name> [--contains] [--in <ref>] [--window <id>] | tree [--window <id>] [snapshot args] | ad <args> | shot <name> | db <sql> | capture <url> | cleanup",
    );
    process.exit(64);
}
