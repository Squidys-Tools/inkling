import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const artifactsDir = join(root, ".artifacts", "ui-smoke");
const require = createRequire(import.meta.url);
const electronPath = require("electron");
const viteBin = join(root, "node_modules", "vite", "bin", "vite.js");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function fail(message) {
  throw new Error(message);
}

function buildPreview() {
  const build = spawnSync(process.execPath, [viteBin, "build", "--mode", "electron-preview"], {
    cwd: root,
    stdio: "inherit",
  });
  if (build.status !== 0) fail("ui:smoke: vite build --mode electron-preview failed.");
}

async function freePort() {
  return new Promise((done, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

function launchElectron(userDataDir, port) {
  const appArgs = [
    ".",
    "--preview",
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
  ];
  const useXvfb = process.platform === "linux" && !process.env.DISPLAY;
  const command = useXvfb ? "xvfb-run" : electronPath;
  const args = useXvfb ? ["-a", "-s", "-screen 0 1280x900x24", electronPath, ...appArgs] : appArgs;
  const stderrTail = [];
  const child = spawn(command, args, {
    cwd: root,
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.on("data", (chunk) => {
    stderrTail.push(...chunk.toString().split("\n").filter(Boolean));
    stderrTail.splice(0, Math.max(0, stderrTail.length - 20));
  });
  child.launchError = null;
  child.on("error", (error) => {
    child.launchError = error;
  });
  child.describeStderr = () => stderrTail.slice(-8).join("\n    ");
  return child;
}

function stopElectron(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") child.kill();
  else process.kill(-child.pid, "SIGTERM");
}

async function findPageTarget(port, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.launchError) {
      fail(
        `ui:smoke: could not start Electron (${child.launchError.message}). Install xvfb-run or run with DISPLAY set.`,
      );
    }
    if (child.exitCode !== null) {
      fail(
        `ui:smoke: Electron exited with code ${child.exitCode} before DevTools came up.\n    ${child.describeStderr()}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find(
        (target) => target.type === "page" && !target.url.startsWith("devtools://"),
      );
      if (page) return page;
    } catch {
      // DevTools is not listening yet.
    }
    await sleep(200);
  }
  fail(
    `ui:smoke: Electron did not expose DevTools on port ${port} within ${timeoutMs / 1000}s.\n    ${child.describeStderr()}`,
  );
}

function connectCdp(url) {
  return new Promise((done, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const consoleErrors = [];
    const consoleWarnings = [];
    let nextId = 0;
    const send = (method, params = {}) =>
      new Promise((resolveSend, rejectSend) => {
        const id = ++nextId;
        pending.set(id, { resolveSend, rejectSend });
        socket.send(JSON.stringify({ id, method, params }));
      });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const waiter = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) waiter?.rejectSend(new Error(message.error.message));
        else waiter?.resolveSend(message.result);
        return;
      }
      if (
        message.method === "Runtime.consoleAPICalled" &&
        ["error", "warning"].includes(message.params.type)
      ) {
        const text = message.params.args.map((arg) => arg.value ?? arg.description).join(" ");
        (message.params.type === "error" ? consoleErrors : consoleWarnings).push(
          `console.${message.params.type}: ${text}`,
        );
      }
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails;
        consoleErrors.push(`uncaught: ${details.exception?.description ?? details.text}`);
      }
      if (
        message.method === "Log.entryAdded" &&
        ["error", "warning"].includes(message.params.entry.level)
      ) {
        (message.params.entry.level === "error" ? consoleErrors : consoleWarnings).push(
          `log.${message.params.entry.level}: ${message.params.entry.text}`,
        );
      }
    };
    socket.onerror = () => reject(new Error(`could not open DevTools socket ${url}`));
    socket.onopen = async () => {
      try {
        await send("Runtime.enable");
        await send("Log.enable");
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {
          width: 1280,
          height: 800,
          deviceScaleFactor: 1,
          mobile: false,
        });
        done({
          send,
          consoleErrors,
          consoleWarnings,
          close: () => socket.close(),
          evaluate: async (expression) => {
            const result = await send("Runtime.evaluate", {
              expression,
              awaitPromise: true,
              returnByValue: true,
            });
            if (result.exceptionDetails)
              throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
            return result.result.value;
          },
        });
      } catch (error) {
        reject(error);
      }
    };
  });
}

const dom = {
  cardCount: `document.querySelectorAll(".library-card").length`,
  cardTexts: `[...document.querySelectorAll(".library-card")].map((card) => card.textContent ?? "")`,
  overlayOpen: `Boolean(document.querySelector(".expanded-overlay"))`,
  clickCardMatching: (text) =>
    `(() => { const card = [...document.querySelectorAll(".library-card")].find((c) => (c.textContent ?? "").includes(${JSON.stringify(text)})); if (!card) return false; card.click(); return true; })()`,
  click: (selector) =>
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`,
  clickByText: (selector, text) =>
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => (node.textContent ?? "").trim() === ${JSON.stringify(text)}); if (!el) return false; el.click(); return true; })()`,
  setValue: (selector, value) =>
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`,
  clickCaptureOption: (title) =>
    `(() => { const option = [...document.querySelectorAll(".capture-option")].find((node) => node.querySelector("strong")?.textContent === ${JSON.stringify(title)}); if (!option) return false; option.click(); return true; })()`,
  exists: (selector) => `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
  pressed: (selector) =>
    `document.querySelector(${JSON.stringify(selector)})?.getAttribute("aria-pressed") === "true"`,
  activeIsSelector: (selector) =>
    `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
};

async function run() {
  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  const userDataDir = mkdtempSync(join(tmpdir(), "inkling-ui-smoke-"));
  const port = await freePort();
  const child = launchElectron(userDataDir, port);
  const results = [];
  let cdp = null;
  let shotIndex = 0;
  let previousFailed = false;

  const screenshot = async (name) => {
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    shotIndex += 1;
    const file = join(artifactsDir, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
    writeFileSync(file, Buffer.from(shot.data, "base64"));
  };

  const waitFor = async (expression, description, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await cdp.evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error(`timed out waiting for ${description}`);
  };

  const step = async (name, body) => {
    if (previousFailed) {
      results.push({ name, status: "SKIP" });
      return;
    }
    try {
      await body();
      results.push({ name, status: "PASS" });
      await screenshot(name);
    } catch (error) {
      previousFailed = true;
      results.push({ name, status: "FAIL", reason: error.message });
      await screenshot(`${name}-failed`).catch(() => {});
    }
  };

  try {
    const target = await findPageTarget(port, child);
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    let baselineCards = 0;
    await step("library grid renders seeded cards", async () => {
      await waitFor(
        `${dom.cardTexts}.some((text) => text.includes("Fuji over the village lights"))`,
        "seeded item card",
      );
      baselineCards = await cdp.evaluate(dom.cardCount);
    });
    await step("grid and list view toggle", async () => {
      await cdp.evaluate(dom.click('button[aria-label="List view"]'));
      await waitFor(dom.pressed('button[aria-label="List view"]'), "list view to be selected");
      await cdp.evaluate(dom.click('button[aria-label="Grid view"]'));
      await waitFor(dom.pressed('button[aria-label="Grid view"]'), "grid view to be selected");
    });
    await step("search filters and clears", async () => {
      await cdp.evaluate(dom.setValue('input[aria-label="Search your mind"]', "Fuji"));
      await waitFor(
        `${dom.cardCount} > 0 && ${dom.cardCount} < ${baselineCards}`,
        "search to narrow the grid",
      );
      await cdp.evaluate(dom.setValue('input[aria-label="Search your mind"]', ""));
      await waitFor(`${dom.cardCount} === ${baselineCards}`, "search to clear back to all cards");
    });
    await step("item overlay opens and closes with the close button and Escape", async () => {
      await cdp.evaluate(dom.clickCardMatching("Fuji over the village lights"));
      await waitFor(dom.overlayOpen, "item overlay to open");
      await cdp.evaluate(dom.click('button[aria-label="Close details"]'));
      await waitFor(`!${dom.overlayOpen}`, "overlay to close from its close button");
      await cdp.evaluate(dom.clickCardMatching("Fuji over the village lights"));
      await waitFor(dom.overlayOpen, "item overlay to reopen");
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor(`!${dom.overlayOpen}`, "overlay to close on Escape");
    });
    const noteText = "ui smoke note";
    await step("note is created and appears in the grid", async () => {
      await cdp.evaluate(dom.click('button[title="Add something to your library"]'));
      await waitFor(dom.exists(".capture-option"), "add menu");
      await cdp.evaluate(dom.clickCaptureOption("Note"));
      await waitFor(dom.exists('input[aria-label="New note"]'), "note input");
      await cdp.evaluate(dom.setValue('input[aria-label="New note"]', noteText));
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await waitFor(
        `${dom.cardTexts}.some((text) => text.includes(${JSON.stringify(noteText)}))`,
        "saved note card",
      );
    });
    const spaceName = "UI Smoke Space";
    await step("space is created and deleted without removing items", async () => {
      await cdp.evaluate(dom.click('button[aria-label="Add a Space"]'));
      await waitFor(dom.exists('input[aria-label="Space name"]'), "space name input");
      await cdp.evaluate(dom.setValue('input[aria-label="Space name"]', spaceName));
      await cdp.evaluate(dom.clickByText("button", "Create Space"));
      await waitFor(dom.exists(`button[aria-label="Delete ${spaceName}"]`), "new space in sidebar");
      const before = await cdp.evaluate(dom.cardCount);
      await cdp.evaluate(dom.click(`button[aria-label="Delete ${spaceName}"]`));
      await waitFor(
        `!${dom.exists(`button[aria-label="Delete ${spaceName}"]`)}`,
        "space to be deleted",
      );
      const after = await cdp.evaluate(dom.cardCount);
      if (after !== before)
        throw new Error(`deleting the space changed the card count from ${before} to ${after}`);
    });
    await step("settings opens on the Archive tab", async () => {
      await cdp.evaluate(dom.click('button[aria-label="Settings"]'));
      await waitFor(dom.exists('aside[aria-label="Settings sections"]'), "settings sections");
      await cdp.evaluate(dom.clickByText(".settings-tab", "Archive"));
      await waitFor(
        dom.exists('.settings-tab.active[aria-current="page"]'),
        "archive tab to be selected",
      );
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor(`!${dom.exists('aside[aria-label="Settings sections"]')}`, "settings to close");
    });
    await step("slash focuses search", async () => {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "/",
        code: "Slash",
        text: "/",
        windowsVirtualKeyCode: 191,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "/",
        code: "Slash",
        windowsVirtualKeyCode: 191,
      });
      await waitFor(
        dom.activeIsSelector('input[aria-label="Search your mind"]'),
        "search to take focus",
      );
    });
    await step("no console errors during the run", async () => {
      if (cdp.consoleErrors.length > 0) throw new Error(cdp.consoleErrors.slice(0, 5).join(" | "));
    });
    for (const warning of new Set(cdp.consoleWarnings)) console.log(`WARN ${warning}`);
  } finally {
    cdp?.close();
    stopElectron(child);
    rmSync(userDataDir, { recursive: true, force: true });
  }

  for (const result of results) {
    const reason = result.reason ? `: ${result.reason}` : "";
    console.log(`${result.status} ${result.name}${reason}`);
  }
  const passed = results.filter((result) => result.status === "PASS").length;
  console.log(`RESULT ${passed}/${results.length} passed`);
  if (results.some((result) => result.status !== "PASS")) process.exit(1);
}

try {
  if (!existsSync(join(root, "node_modules")))
    fail("ui:smoke: node_modules is missing. Run bun install first.");
  buildPreview();
  await run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
