#!/usr/bin/env bun
/**
 * Drive the inkling web preview from an agent, over the Chrome DevTools Protocol.
 *
 * Plain JavaScript on purpose: `tsconfig.json` only includes `src/` and
 * `knip.json` only projects `src/**` and `benchmarks/**`, so nothing in the
 * frontend toolchain picks this file up.
 *
 * Every command is a short-lived process that reattaches to the browser recorded
 * in `<run-dir>/browser.json`. Nothing here knows a port number up front: ports
 * are picked at runtime and recorded, because the developer's own dev server
 * already holds the fixed Vite port.
 *
 * Usage, evidence rules, and the teardown contract live in SKILL.md.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const STATE_DIR = join(tmpdir(), "inkling-verify");
const DEFAULT_RUN_DIR = join(STATE_DIR, "latest");
const WAIT_TIMEOUT_MS = 30000;
const CDP_TIMEOUT_MS = 20000;

function log(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function runDirFor(args) {
  return resolve(args["run-dir"] ?? DEFAULT_RUN_DIR);
}

function statePath(dir, name) {
  return join(dir, name);
}

function readState(dir, name) {
  const path = statePath(dir, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeState(dir, name, value) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(statePath(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}

function requireState(dir, name) {
  const state = readState(dir, name);
  if (!state) fail(`${name} missing in ${dir}. Run the matching serve/start command first.`);
  return state;
}

function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function record(dir, command, argv, summary) {
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, "transcript.jsonl"),
      `${JSON.stringify({ at: new Date().toISOString(), command, argv, ...summary })}\n`,
    );
  } catch {
    // Evidence logging must never be the reason a command fails.
  }
}

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

// Vite binds whatever "localhost" resolves to (::1 first on Windows) while
// Chrome's debug port is pinned to IPv4, so the host matters when probing.
function freePort(host = "127.0.0.1") {
  return new Promise((done, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, host, () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

async function pollUntil(check, { timeoutMs = WAIT_TIMEOUT_MS, intervalMs = 200, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  for (;;) {
    try {
      const value = await check();
      if (value) return value;
      lastError = undefined;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
    }
    await sleep(intervalMs);
  }
}

function killTree(pid, label) {
  if (!isAlive(pid)) return false;
  if (process.platform === "win32") {
    // Tracked pid only, never a name match: several inkling instances and dev
    // servers share this machine.
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  log(`stopped ${label} (pid ${pid})`);
  return true;
}

function tail(file, lines = 20) {
  if (!existsSync(file)) return "";
  const content = readFileSync(file, "utf8").trimEnd().split("\n");
  return content.slice(-lines).join("\n");
}

// --- CDP ---------------------------------------------------------------

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(typeof event.data === "string" ? event.data : "");
      } catch {
        return;
      }
      const entry = message.id === undefined ? null : this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result ?? {});
    });
  }

  static connect(url) {
    return new Promise((done, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => reject(new Error(`CDP connect timed out: ${url}`)), CDP_TIMEOUT_MS);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        done(new Cdp(socket));
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`CDP connect failed: ${url}`));
      });
    });
  }

  send(method, params = {}, timeoutMs = CDP_TIMEOUT_MS) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((done, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: done, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket.close();
    } catch {
      // Nothing to do; the process is exiting anyway.
    }
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`page exception: ${detail}`);
    }
    return result.result?.value;
  }

  async withPage(fn) {
    try {
      return await fn(this);
    } finally {
      this.close();
    }
  }
}

async function httpJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.json();
}

async function listTargets(debugPort) {
  return httpJson(`http://127.0.0.1:${debugPort}/json/list`);
}

function pageTarget(targets) {
  return targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
}

async function connect(args) {
  const dir = runDirFor(args);
  const browser = requireState(dir, "browser.json");
  if (!isAlive(browser.pid)) fail(`the browser from this run (pid ${browser.pid}) is gone. Run start again.`);
  let target;
  try {
    target = pageTarget(await listTargets(browser.debugPort));
  } catch (error) {
    fail(`cannot reach the browser on port ${browser.debugPort}: ${error.message}`);
  }
  if (!target) fail(`no page target on port ${browser.debugPort}.`);
  return { dir, browser, cdp: await Cdp.connect(target.webSocketDebuggerUrl) };
}

async function pollPage(cdp, expression, options) {
  return pollUntil(() => cdp.evaluate(expression).then((value) => value || null), options);
}

function selectorExpression(selector) {
  return `document.querySelector(${JSON.stringify(selector)})`;
}

// --- serve -------------------------------------------------------------

function resolveChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter((candidate) => typeof candidate === "string" && candidate.length > 0);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  fail("Chrome not found. Set CHROME_PATH or pass --chrome <path-to-chrome>.");
}

async function commandServe(args) {
  const dir = runDirFor(args);
  const mode = args.mode === "preview" ? "preview" : "dev";
  const previous = readState(dir, "server.json");
  if (previous?.pid && isAlive(previous.pid)) {
    fail(`a server from this run dir is already alive (pid ${previous.pid}, ${previous.url}). Reuse it, or stop it first.`);
  }
  if (mode === "preview" && !existsSync(join(REPO_ROOT, "dist", "index.html"))) {
    fail("mode preview serves dist/, which is missing. Run `bun run build` first, or use --mode dev.");
  }
  const port = args.port ? Number(args.port) : await freePort("localhost");
  const url = `http://localhost:${port}/`;
  const logPath = statePath(dir, "server.log");
  mkdirSync(dir, { recursive: true });
  const out = openSync(logPath, "a");
  const scriptArgs = mode === "preview" ? ["run", "preview", "--", "--port", String(port), "--strictPort"] : ["run", "dev", "--", "--port", String(port), "--strictPort"];
  const child = spawn("bun", scriptArgs, { cwd: REPO_ROOT, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  writeState(dir, "server.json", { pid: child.pid, port, url, mode, logPath, startedAt: new Date().toISOString() });

  log(`starting bun run ${mode} on port ${port} (pid ${child.pid}), log ${logPath}`);
  try {
    await pollUntil(
      async () => {
        if (!isAlive(child.pid)) throw new Error(`the server exited early:\n${tail(logPath)}`);
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
        return response.ok;
      },
      { timeoutMs: 120000, intervalMs: 400, label: `${url} to answer` },
    );
  } catch (error) {
    killTree(child.pid, "server");
    fail(error.message);
  }
  record(dir, "serve", args._, { ok: true, pid: child.pid, url, mode });
  log(`ready: ${url}\nrun dir: ${dir}`);
}

// --- doctor ------------------------------------------------------------

async function commandDoctor(args) {
  const dir = runDirFor(args);
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok, detail });
    log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  };

  const bunPin = spawnSync("bun", ["run", "check:bun-version"], { cwd: REPO_ROOT, encoding: "utf8" });
  check("Bun matches .bun-version", bunPin.status === 0, (bunPin.stderr || bunPin.stdout || "").trim().split("\n")[0] || "1.4.0");

  const server = readState(dir, "server.json");
  if (!server) {
    check("dev server recorded", false, `no server.json in ${dir}`);
  } else {
    check("dev server process alive", isAlive(server.pid), `pid ${server.pid}`);
    let answered = false;
    try {
      answered = (await fetch(server.url, { signal: AbortSignal.timeout(3000) })).ok;
    } catch {
      answered = false;
    }
    check("dev server answers", answered, server.url);
  }

  const browser = readState(dir, "browser.json");
  if (!browser) {
    check("browser recorded", false, `no browser.json in ${dir}`);
  } else {
    check("browser process alive", isAlive(browser.pid), `pid ${browser.pid}`);
    try {
      const version = await httpJson(`http://127.0.0.1:${browser.debugPort}/json/version`);
      check("browser debug port is ours", Boolean(version.webSocketDebuggerUrl), version.Browser);
    } catch (error) {
      check("browser debug port is ours", false, error.message);
    }
    try {
      const target = pageTarget(await listTargets(browser.debugPort));
      check("drive target is the app page", Boolean(target), target?.url ?? "no page target");
      if (target) {
        const { cdp } = await connect(args);
        await cdp.withPage(async (page) => {
          const badge = await page.evaluate(`Boolean(document.querySelector('[data-testid="web-preview-badge"]'))`);
          check("seed library is active (not a Tauri backend)", badge === true, badge ? "web-preview-badge present" : "badge missing: is this a Tauri window?");
          const count = await page.evaluate(`document.querySelector('.result-count')?.textContent ?? null`);
          check("library rendered results", Boolean(count), count ?? "no .result-count");
          const errors = await page.evaluate(`window.__verifyErrors?.length ?? 0`);
          check("page reported no runtime errors", errors === 0, errors ? `${errors} captured` : "none captured");
        });
      }
    } catch (error) {
      check("drive target inspectable", false, error.message);
    }
  }

  for (const sibling of runDirs()) {
    if (sibling === dir) continue;
    const other = readState(sibling, "browser.json");
    const otherServer = readState(sibling, "server.json");
    if (other?.pid && isAlive(other.pid)) log(`note: another run dir (${sibling}) has a live browser (pid ${other.pid}). Do not drive it.`);
    if (otherServer?.pid && isAlive(otherServer.pid)) log(`note: another run dir (${sibling}) has a live server (pid ${otherServer.pid}).`);
  }

  const failed = checks.filter((entry) => !entry.ok);
  record(dir, "doctor", args._, { ok: failed.length === 0, failed: failed.map((entry) => entry.name) });
  if (failed.length > 0) fail(`${failed.length} check(s) failed.`);
  log("doctor: all checks passed");
}

function runDirs() {
  if (!existsSync(STATE_DIR)) return [];
  return readdirSync(STATE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(STATE_DIR, entry.name));
}

// --- browser -----------------------------------------------------------

async function commandStart(args) {
  const dir = runDirFor(args);
  const server = requireState(dir, "server.json");
  if (!isAlive(server.pid)) fail(`the recorded dev server (pid ${server.pid}) is gone. Run serve again.`);
  const previous = readState(dir, "browser.json");
  if (previous?.pid && isAlive(previous.pid)) {
    fail(`a browser from this run dir is already alive (pid ${previous.pid}). Reuse it, or stop it first.`);
  }
  const debugPort = await freePort();
  const profileDir = statePath(dir, "chrome-profile");
  mkdirSync(profileDir, { recursive: true });
  const chrome = resolveChrome(args.chrome);
  const width = Number(args.width ?? 1440);
  const height = Number(args.height ?? 900);
  const chromeArgs = [
    `--remote-debugging-port=${debugPort}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--window-size=${width},${height}`,
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-extensions",
    "--disable-sync",
    "--disable-translate",
    "about:blank",
  ];
  if (args.headful !== true) chromeArgs.unshift("--headless=new");
  const child = spawn(chrome, chromeArgs, { detached: true, stdio: "ignore" });
  child.unref();
  writeState(dir, "browser.json", {
    pid: child.pid,
    debugPort,
    profileDir,
    chrome,
    size: { width, height },
    headful: args.headful === true,
    url: server.url,
    startedAt: new Date().toISOString(),
  });

  log(`starting Chrome (pid ${child.pid}) on debug port ${debugPort}`);
  let url = args.url ?? server.url;
  let target;
  let cdp;
  try {
    target = await pollUntil(
      async () => {
        if (!isAlive(child.pid)) throw new Error("Chrome exited during startup");
        const found = pageTarget(await listTargets(debugPort));
        return found ?? null;
      },
      { label: "a Chrome page target" },
    );
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.evaluate(
      `(() => {
        if (window.__verifyErrors) return true;
        window.__verifyErrors = [];
        window.addEventListener("error", (event) => window.__verifyErrors.push(String(event.message)));
        window.addEventListener("unhandledrejection", (event) => window.__verifyErrors.push(String(event.reason)));
        return true;
      })()`,
    );
    await cdp.send("Page.navigate", { url });
    await pollPage(cdp, `document.readyState === "complete" && Boolean(document.querySelector(".app-shell"))`, {
      label: ".app-shell to render",
      timeoutMs: 60000,
    });
    await pollPage(cdp, `Boolean(document.querySelector('[data-testid="web-preview-badge"]'))`, {
      label: "the web preview badge (seed library)",
      timeoutMs: 30000,
    });
  } catch (error) {
    cdp?.close();
    killTree(child.pid, "browser");
    fail(error.message);
  }
  cdp.close();
  record(dir, "start", args._, { ok: true, pid: child.pid, debugPort, url: target.url });
  log(`ready: ${url}\nrun dir: ${dir}`);
}

async function commandNavigate(args) {
  const url = args.url ?? requireState(runDirFor(args), "server.json").url;
  const { dir, cdp } = await connect(args);
  await cdp.withPage(async (page) => {
    await page.send("Page.navigate", { url });
    await pollPage(page, `document.readyState === "complete"`, { label: `navigation to ${url}` });
  });
  record(dir, "navigate", args._, { ok: true, url });
  log(`navigated: ${url}`);
}

async function commandWait(args) {
  const dir = runDirFor(args);
  const timeoutMs = Number(args.timeout ?? WAIT_TIMEOUT_MS);
  const { cdp } = await connect(args);
  await cdp.withPage(async (page) => {
    if (args.selector) {
      await pollPage(page, `Boolean(${selectorExpression(args.selector)})`, { timeoutMs, label: `selector ${args.selector}` });
    } else if (args.text) {
      await pollPage(page, `document.body.innerText.includes(${JSON.stringify(args.text)})`, { timeoutMs, label: `text ${JSON.stringify(args.text)}` });
    } else if (args.expr) {
      await pollUntil(() => page.evaluate(args.expr).then((value) => value || null), { timeoutMs, label: args.expr });
    } else {
      fail("wait needs --selector, --text, or --expr");
    }
  });
  record(dir, "wait", args._, { ok: true });
  log("wait: satisfied");
}

async function commandEval(args) {
  if (!args.expr) fail("eval needs --expr");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  const value = await cdp.withPage((page) => page.evaluate(args.expr));
  record(dir, "eval", args._, { ok: true, expr: args.expr });
  log(JSON.stringify(value, null, 2));
}

async function commandText(args) {
  if (!args.selector) fail("text needs --selector");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  const value = await cdp.withPage((page) =>
    page.evaluate(
      `(() => { const el = ${selectorExpression(args.selector)}; return el ? (el.innerText ?? el.textContent) : null; })()`,
    ),
  );
  record(dir, "text", args._, { ok: true, selector: args.selector });
  log(value === null ? "(not found)" : value);
}

async function commandClick(args) {
  const target = args.selector ?? (args.within ? `${args.within} -> ${args.text}` : args.text);
  if (!target) fail("click needs --selector, or --text (optionally scoped with --within)");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  await cdp.withPage(async (page) => {
    // --within scopes a text match: several surfaces reuse the same label, and
    // the first match in document order is usually not the one meant.
    // A childless span wins over a wrapping control because a row like a Space
    // puts invisible hover controls over its own center: clicking the label is
    // both what a user does and the only place that hits the row itself.
    const root = args.within ? selectorExpression(args.within) : "document";
    const label = JSON.stringify(args.text);
    const expression = args.selector
      ? selectorExpression(args.selector)
      : `(() => {
          const matches = (el) => (el.innerText ?? el.textContent ?? "").trim().startsWith(${label});
          const root = ${root};
          return [...root.querySelectorAll("span")].filter((el) => el.children.length === 0).find(matches)
            ?? [...root.querySelectorAll("button, [role=button], a, input, textarea, article")].find(matches)
            ?? null;
        })()`;
    await pollPage(page, `Boolean(${expression})`, { label: `click target ${JSON.stringify(target)}` });
    const box = await page.evaluate(
      `(() => { const el = ${expression}; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }; })()`,
    );
    const point = { x: Math.round(box.x), y: Math.round(box.y) };
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  });
  record(dir, "click", args._, { ok: true, target });
  log(`clicked ${target}`);
}

async function commandType(args) {
  if (!args.selector) fail("type needs --selector");
  if (typeof args.text !== "string") fail("type needs --text");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  await cdp.withPage(async (page) => {
    await pollPage(page, `Boolean(${selectorExpression(args.selector)})`, { label: `field ${args.selector}` });
    await page.evaluate(`(() => { const el = ${selectorExpression(args.selector)}; el.focus(); el.select?.(); return true; })()`);
    // insertText goes through the real editing pipeline, so a React controlled
    // input sees it as a user edit instead of a silent value assignment.
    await page.send("Input.insertText", { text: args.text });
  });
  record(dir, "type", args._, { ok: true, selector: args.selector });
  log(`typed into ${args.selector}`);
}

async function commandFocus(args) {
  if (!args.selector) fail("focus needs --selector");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  await cdp.withPage(async (page) => {
    await pollPage(page, `Boolean(${selectorExpression(args.selector)})`, { label: `focus target ${args.selector}` });
    await page.evaluate(`(() => { ${selectorExpression(args.selector)}.focus(); return true; })()`);
  });
  record(dir, "focus", args._, { ok: true, selector: args.selector });
  log(`focused ${args.selector}`);
}

async function commandKey(args) {
  if (!args.key) fail("key needs --key (for example Escape, Slash, Enter)");
  const dir = runDirFor(args);
  const { cdp } = await connect(args);
  const known = {
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    Slash: { key: "/", code: "Slash", windowsVirtualKeyCode: 191, text: "/" },
  };
  const stroke = known[args.key] ?? { key: args.key, code: args.key };
  await cdp.withPage(async (page) => {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...stroke });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...stroke });
  });
  record(dir, "key", args._, { ok: true, key: args.key });
  log(`pressed ${args.key}`);
}

async function commandShot(args) {
  const out = args.out ? resolve(args.out) : null;
  if (!out) fail("shot needs --out <path.png>");
  const dir = runDirFor(args);
  const { cdp, browser } = await connect(args);
  const format = out.toLowerCase().endsWith(".jpg") || out.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
  const result = await cdp.withPage((page) => page.send("Page.captureScreenshot", { format, captureBeyondViewport: false }));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(result.data, "base64"));
  record(dir, "shot", args._, { ok: true, out, format, size: browser.size });
  log(`shot: ${out}`);
}

async function commandStop(args) {
  const dir = runDirFor(args);
  const browser = readState(dir, "browser.json");
  const server = readState(dir, "server.json");
  if (browser?.pid) killTree(browser.pid, "browser");
  if (server?.pid) killTree(server.pid, "dev server");
  for (const [name, state] of [
    ["browser", browser],
    ["server", server],
  ]) {
    if (!state) continue;
    try {
      await pollUntil(async () => !isAlive(state.pid), { timeoutMs: 15000, intervalMs: 250, label: `${name} pid ${state.pid} to exit` });
    } catch (error) {
      log(`warning: ${error.message} — re-check by hand before starting another run`);
    }
  }
  if (browser) {
    try {
      await fetch(`http://127.0.0.1:${browser.debugPort}/json/version`, { signal: AbortSignal.timeout(2000) });
      log(`warning: debug port ${browser.debugPort} still answers`);
    } catch {
      log(`debug port ${browser.debugPort} released`);
    }
  }
  const evidence = join(dir, "shots");
  record(dir, "stop", args._, { ok: true });
  log(`evidence kept: ${existsSync(evidence) ? evidence : dir}`);
}

const COMMANDS = {
  serve: commandServe,
  doctor: commandDoctor,
  start: commandStart,
  navigate: commandNavigate,
  wait: commandWait,
  eval: commandEval,
  text: commandText,
  click: commandClick,
  type: commandType,
  focus: commandFocus,
  key: commandKey,
  shot: commandShot,
  stop: commandStop,
};

const [, , name, ...rest] = process.argv;
if (!name || !COMMANDS[name]) {
  fail(`usage: bun ${process.argv[1]} <${Object.keys(COMMANDS).join("|")}> [options]. See SKILL.md.`);
}
await COMMANDS[name](parseArgs(rest));
// Force the exit: a kept-alive fetch socket or a forwarded log stream would
// otherwise leave the caller's tool call hanging after the work is done.
process.exit(0);
