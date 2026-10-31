#!/usr/bin/env bun
// Runs a list of UI steps against one inkling instance over CDP and records evidence.
// Usage: bun scripts/drive.mjs <cdpPort> <steps.json> <evidenceDir>
// Each step is one key: click | clickText | rightClick | fill | key | wait | expect | shot.
// Writes <evidenceDir>/steps.log and <evidenceDir>/console.log; a failed step also writes failure.png.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [port, stepsFile, evidenceDir] = process.argv.slice(2);
if (!port || !stepsFile || !evidenceDir)
  throw new Error("usage: drive.mjs <cdpPort> <steps.json> <evidenceDir>");
mkdirSync(evidenceDir, { recursive: true });
const steps = JSON.parse(await Bun.file(stepsFile).text());

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find(
  (target) => target.type === "page" && target.url.startsWith("app://local/"),
);
if (!page) throw new Error(`no inkling page on CDP port ${port}`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let seq = 0;
const pending = new Map();
const consoleLines = [];
socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.consoleAPICalled") {
    const text = msg.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
    consoleLines.push(`[${msg.params.type}] ${text}`);
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const details = msg.params.exceptionDetails;
    consoleLines.push(`[exception] ${details.exception?.description ?? details.text}`);
  }
  if (msg.method === "Log.entryAdded")
    consoleLines.push(`[${msg.params.entry.level}] ${msg.params.entry.text}`);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} got no reply in 20s: the page is wedged, run doctor`));
    }, 20000);
    pending.set(id, {
      resolve: (value) => (clearTimeout(timer), resolve(value)),
      reject: (error) => (clearTimeout(timer), reject(error)),
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
await send("Runtime.enable");
await send("Log.enable");

const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const poll = async (expression, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  return false;
};
const q = (selector) => JSON.stringify(selector);
const log = (line) => {
  console.log(line);
  appendFileSync(join(evidenceDir, "steps.log"), `${line}\n`);
};

const KEYS = {
  Enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  "/": { key: "/", code: "Slash", keyCode: 191, text: "/" },
};

async function run(step) {
  const timeout = step.timeoutMs ?? 8000;
  if (step.click || step.clickText || step.rightClick) {
    const selector = step.rightClick ?? step.click ?? step.clickText.selector;
    const text = step.clickText?.text ?? "";
    const match = `[...document.querySelectorAll(${q(selector)})].find(
      (node) => node.textContent.includes(${q(text)}) && node.getClientRects().length,
    )`;
    if (!(await poll(`!!${match}`, timeout)))
      throw new Error(`no visible ${selector}${text ? ` containing "${text}"` : ""}`);
    if (step.rightClick) {
      const point = await evaluate(`(() => {
        const rect = ${match}.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`);
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...point,
        button: "right",
        buttons: 2,
        clickCount: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...point,
        button: "right",
        buttons: 0,
        clickCount: 1,
      });
    } else {
      await evaluate(`(() => {
        const el = ${match};
        el.focus({ preventScroll: true });
        el.click();
        return true;
      })()`);
    }
    return;
  }
  if (step.fill) {
    const focused = await poll(
      `(() => { const el = document.querySelector(${q(step.fill)}); if (!el) return false; el.focus(); el.select?.(); return true; })()`,
      timeout,
    );
    if (!focused) throw new Error(`no field ${step.fill}`);
    await send("Input.insertText", { text: step.text });
    return;
  }
  if (step.key) {
    const def = KEYS[step.key] ?? { key: step.key, code: step.key, text: step.key };
    await send("Input.dispatchKeyEvent", {
      type: def.text ? "keyDown" : "rawKeyDown",
      ...def,
      windowsVirtualKeyCode: def.keyCode,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      ...def,
      windowsVirtualKeyCode: def.keyCode,
    });
    return;
  }
  if (step.wait) {
    if (!(await poll(`!!document.querySelector(${q(step.wait)})`, timeout)))
      throw new Error(`timed out waiting for ${step.wait}`);
    return;
  }
  if (step.expect) {
    if (!(await poll(`Boolean(${step.expect})`, timeout)))
      throw new Error(`expectation never held: ${step.expect}`);
    return;
  }
  if (step.shot) {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await Bun.write(join(evidenceDir, step.shot), Buffer.from(data, "base64"));
    return;
  }
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

let failed = false;
for (const [index, step] of steps.entries()) {
  const label = step.label ?? JSON.stringify(step).slice(0, 120);
  try {
    await run(step);
    log(`PASS ${index + 1} ${label}`);
  } catch (error) {
    log(`FAIL ${index + 1} ${label}: ${error.message}`);
    try {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await Bun.write(join(evidenceDir, "failure.png"), Buffer.from(data, "base64"));
    } catch (shotError) {
      log(`no failure.png: ${shotError.message}`);
    }
    failed = true;
    break;
  }
}
writeFileSync(join(evidenceDir, "console.log"), `${consoleLines.join("\n")}\n`);
socket.close();
process.exit(failed ? 1 : 0);
