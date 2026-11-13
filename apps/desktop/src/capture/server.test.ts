import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request } from "node:http";
import { startCaptureServer as startOnKnownPorts } from "./server.ts";

const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startCaptureServer>>> = [];

// A free port each, so a test never meets the installed app or another test.
const startCaptureServer = (
  options: Omit<Parameters<typeof startOnKnownPorts>[0], "approvePairing" | "ports"> &
    Partial<Parameters<typeof startOnKnownPorts>[0]>,
) => startOnKnownPorts({ approvePairing: async () => false, ports: [], ...options });

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "inkling-capture-server-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const page = (title: string) =>
  JSON.stringify({
    version: 1,
    kind: "page",
    url: "https://example.com/article",
    title,
    defuddledHtml: "<p>safe</p><script>bad()</script>",
    text: "saved before processing",
  });

test("loopback capture uses a persisted bearer token and saves through the library", async () => {
  const directory = temporaryDirectory();
  const saved: unknown[] = [];
  const save = async (capture: unknown) => {
    saved.push(capture);
    return { id: `item-${saved.length}` };
  };
  let server = await startCaptureServer({ libraryDirectory: directory, save });
  servers.push(server);

  const status = server.status();
  expect(status.running).toBe(true);
  const base = `http://127.0.0.1:${status.port}`;
  const healthUrl = `${base}/v1/health`;
  const originalToken = server.getPairingToken();
  expect(originalToken).toMatch(/^[0-9a-f]{64}$/u);
  expect(readFileSync(join(directory, "pairing_token"), "utf8")).toBe(originalToken);

  const preflight = await fetch(`${base}/v1/captures`, {
    method: "OPTIONS",
    headers: {
      Origin: "chrome-extension://abcdef",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("chrome-extension://abcdef");
  expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");

  expect((await fetch(healthUrl, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
  const deniedOrigin = await fetch(healthUrl, {
    headers: { Authorization: `Bearer ${originalToken}`, Origin: "https://example.com" },
  });
  expect(deniedOrigin.status).toBe(403);
  const acceptedHealth = await fetch(healthUrl, {
    headers: { Authorization: `Bearer ${originalToken}`, Origin: "chrome-extension://abcdef" },
  });
  expect(acceptedHealth.status).toBe(200);
  expect(acceptedHealth.headers.get("access-control-allow-origin")).toBe(
    "chrome-extension://abcdef",
  );

  const response = await fetch(`${base}/v1/captures?ignored=1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${originalToken}`,
      Origin: "chrome-extension://abcdef",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: page("Captured page"),
  });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ id: "item-1" });
  const quote = await fetch(`${base}/v1/captures`, {
    method: "POST",
    headers: { Authorization: `Bearer ${originalToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 1,
      kind: "quote",
      url: "https://example.com/article",
      selection: "Kept words",
      attribution: "An article",
    }),
  });
  expect(quote.status).toBe(201);
  expect(saved).toEqual([
    { kind: "url", url: "https://example.com/article", title: "Captured page" },
    {
      kind: "quote",
      url: "https://example.com/article",
      selection: "Kept words",
      attribution: "An article",
    },
  ]);

  const nextToken = await server.regeneratePairingToken();
  expect(nextToken).not.toBe(originalToken);
  expect(await server.answersHealthCheck()).toBe(true);
  expect(
    (await fetch(healthUrl, { headers: { Authorization: `Bearer ${originalToken}` } })).status,
  ).toBe(401);
  await server.close();
  expect(server.status()).toEqual({ running: false, port: null });
  expect(await server.answersHealthCheck()).toBe(false);
  server = await startCaptureServer({ libraryDirectory: directory, save });
  servers.push(server);
  expect(server.getPairingToken()).toBe(nextToken);
});

test("a library that cannot save answers 503 instead of a fake success", async () => {
  const server = await startCaptureServer({
    libraryDirectory: temporaryDirectory(),
    save: async () => {
      throw new Error("the library process stopped");
    },
  });
  servers.push(server);
  const response = await fetch(`http://127.0.0.1:${server.status().port}/v1/captures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${server.getPairingToken()}`,
      "Content-Type": "application/json",
    },
    body: page("Lost page"),
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "storage-unavailable" });
});

test("closing the receiver waits for an in-flight capture to finish", async () => {
  const directory = temporaryDirectory();
  const captureStarted = Promise.withResolvers<void>();
  const captureResult = Promise.withResolvers<{ id: string }>();
  const server = await startCaptureServer({
    libraryDirectory: directory,
    save: async () => {
      captureStarted.resolve();
      return captureResult.promise;
    },
  });
  servers.push(server);

  const responsePromise = fetch(`http://127.0.0.1:${server.status().port}/v1/captures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${server.getPairingToken()}`,
      "Content-Type": "application/json",
    },
    body: page("In-flight capture"),
  });
  await captureStarted.promise;

  let closeFinished = false;
  const closing = server.close().then(() => {
    closeFinished = true;
  });
  await Promise.resolve();
  expect(closeFinished).toBe(false);

  captureResult.resolve({ id: "in-flight" });
  expect((await responsePromise).status).toBe(201);
  await closing;
  expect(closeFinished).toBe(true);
});

test("pairing hands the token to an extension only after the user approves", async () => {
  const asked: Array<{ signal: AbortSignal; answer: (approved: boolean) => void }> = [];
  const server = await startCaptureServer({
    libraryDirectory: temporaryDirectory(),
    save: async () => ({ id: "unused" }),
    approvePairing: (signal) => {
      const { promise, resolve } = Promise.withResolvers<boolean>();
      asked.push({ signal, answer: resolve });
      return promise;
    },
  });
  servers.push(server);
  const base = `http://127.0.0.1:${server.status().port}`;
  const ask = (origin?: string) =>
    fetch(`${base}/v1/pair`, { method: "POST", headers: origin ? { Origin: origin } : {} });
  const answer = async (id: string) => {
    const response = await fetch(`${base}/v1/pair/${id}`);
    return { status: response.status, body: await response.json() };
  };

  // A web page can send no origin, or `null` from a sandboxed frame.
  for (const origin of [undefined, "null", "https://example.com"])
    expect((await ask(origin)).status).toBe(403);
  expect(asked).toHaveLength(0);

  const first = await ask("chrome-extension://abcdef");
  expect(first.status).toBe(202);
  const { app, id } = await first.json();
  expect(app).toBe("inkling");
  // The extension asks every second while the user decides, past the receiver's rate limit.
  for (let asks = 0; asks < 61; asks += 1)
    expect(await answer(id)).toEqual({ status: 200, body: { status: "pending" } });

  // A second request while the user decides cancels both.
  expect((await ask("chrome-extension://other")).status).toBe(409);
  expect(asked[0].signal.aborted).toBe(true);
  expect(await answer(id)).toEqual({ status: 200, body: { status: "denied" } });
  asked[0].answer(true);
  expect((await answer(id)).status).toBe(404);

  const second = await (await ask("chrome-extension://abcdef")).json();
  asked[1].answer(true);
  await Promise.resolve();
  expect(await answer(second.id)).toEqual({
    status: 200,
    body: { status: "approved", token: server.getPairingToken() },
  });
  expect((await answer(second.id)).status).toBe(404);
});

test("a request whose Host is not the loopback address is refused", async () => {
  const server = await startCaptureServer({
    libraryDirectory: temporaryDirectory(),
    save: async () => ({ id: "unused" }),
  });
  servers.push(server);
  const answered = Promise.withResolvers<number | undefined>();
  request({
    host: "127.0.0.1",
    port: server.status().port ?? 0,
    path: "/v1/health",
    headers: { Host: "rebound.example", Authorization: `Bearer ${server.getPairingToken()}` },
  })
    .on("response", (response) => answered.resolve(response.statusCode))
    .on("error", answered.reject)
    .end();
  expect(await answered.promise).toBe(403);
});

test("the receiver takes the next port when a known one is in use", async () => {
  const holders = [createServer(), createServer()];
  const ports: number[] = [];
  for (const holder of holders) {
    const listening = Promise.withResolvers<void>();
    holder.listen(0, "127.0.0.1", listening.resolve);
    await listening.promise;
    const address = holder.address();
    if (address && typeof address !== "string") ports.push(address.port);
  }
  // The second port is free again; the first is still held.
  await new Promise((resolve) => holders[1].close(resolve));
  try {
    const server = await startCaptureServer({
      libraryDirectory: temporaryDirectory(),
      save: async () => ({ id: "unused" }),
      ports,
    });
    servers.push(server);
    expect(server.status().port).toBe(ports[1]);
    expect(await server.answersHealthCheck()).toBe(true);
  } finally {
    await new Promise((resolve) => holders[0].close(resolve));
  }
});
