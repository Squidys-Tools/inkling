import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCaptureServer } from "./server.ts";

const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startCaptureServer>>> = [];

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
  const captureUrl = async (input: unknown) => {
    saved.push(input);
    return { id: `item-${saved.length}` };
  };
  let server = await startCaptureServer({ libraryDirectory: directory, captureUrl });
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
  expect(saved).toEqual([
    {
      sourceUrl: "https://example.com/article",
      title: "Captured page",
      captureSource: "browser extension",
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
  server = await startCaptureServer({ libraryDirectory: directory, captureUrl });
  servers.push(server);
  expect(server.getPairingToken()).toBe(nextToken);
});

test("a library that cannot save answers 503 instead of a fake success", async () => {
  const server = await startCaptureServer({
    libraryDirectory: temporaryDirectory(),
    captureUrl: async () => {
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
    captureUrl: async () => {
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
