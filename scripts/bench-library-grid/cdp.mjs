import assert from "node:assert/strict";
import { createServer } from "node:net";
import { setTimeout as pause } from "node:timers/promises";

export async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

export async function connect(port, child) {
  const deadline = performance.now() + 60_000;
  let page;
  while (performance.now() < deadline) {
    assert(!child.launchError, `Electron launch failed: ${child.launchError?.message}`);
    assert(child.exitCode === null, `Electron exited with code ${child.exitCode}`);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      page = targets.find(
        (target) => target.type === "page" && target.url.startsWith("app://local/"),
      );
      if (page) break;
    } catch {}
    await pause(100);
  }
  assert(page, "Electron did not expose a production app page within 60 seconds");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const remoteRequests = [];
  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 60_000);
      pending.set(id, { done, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
      const request = pending.get(event.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(event.id);
      if (event.error) request.reject(new Error(event.error.message));
      else request.done(event.result);
    } else if (event.method === "Fetch.requestPaused") {
      remoteRequests.push(event.params.request.url);
      void send("Fetch.fulfillRequest", {
        requestId: event.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/css" }],
        body: "",
      }).catch((error) => errors.push(error.message));
    } else if (event.method === "Runtime.exceptionThrown") {
      errors.push(
        event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text,
      );
    } else if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
      errors.push(event.params.args.map((arg) => arg.value ?? arg.description).join(" "));
    } else if (event.method === "Log.entryAdded" && event.params.entry.level === "error") {
      errors.push(event.params.entry.text);
    }
  };
  socket.onclose = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("CDP socket closed"));
    }
    pending.clear();
  };
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    return result.result.value;
  };
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Fetch.enable", {
    patterns: [{ urlPattern: "http://*" }, { urlPattern: "https://*" }],
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 960,
    height: 540,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { send, evaluate, errors, remoteRequests, close: () => socket.close() };
}
