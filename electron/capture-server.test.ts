import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCaptureServer } from "./capture-server.ts";
import { openTestLibrary, type TestLibrary } from "./storage/test-library.ts";

const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startCaptureServer>>> = [];
const libraries: TestLibrary[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "inkling-electron-capture-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const library of libraries.splice(0)) await library.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("loopback capture uses a persisted bearer token and creates a pending storage item", async () => {
  const directory = temporaryDirectory();
  const library = await openTestLibrary(join(directory, "library.sqlite3"));
  libraries.push(library);
  let server = await startCaptureServer({
    libraryDirectory: directory,
    captureUrl: (input) => library.captureUrl(input),
  });
  servers.push(server);

  const status = server.status();
  expect(status.running).toBe(true);
  if (!status.healthUrl) throw new Error("capture server is not listening");
  expect(new URL(status.healthUrl).hostname).toBe("127.0.0.1");
  const originalToken = server.getPairingToken();
  expect(originalToken).toMatch(/^[0-9a-f]{64}$/u);
  expect(readFileSync(join(directory, "pairing_token"), "utf8")).toBe(originalToken);

  const preflight = await fetch(`http://127.0.0.1:${status.port}/v1/captures`, {
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

  const health = await fetch(status.healthUrl, {
    headers: { Authorization: "Bearer wrong" },
  });
  expect(health.status).toBe(401);
  const deniedOrigin = await fetch(status.healthUrl, {
    headers: {
      Authorization: `Bearer ${originalToken}`,
      Origin: "https://example.com",
    },
  });
  expect(deniedOrigin.status).toBe(403);
  const acceptedHealth = await fetch(status.healthUrl, {
    headers: {
      Authorization: `Bearer ${originalToken}`,
      Origin: "chrome-extension://abcdef",
    },
  });
  expect(acceptedHealth.status).toBe(200);
  expect(acceptedHealth.headers.get("access-control-allow-origin")).toBe(
    "chrome-extension://abcdef",
  );
  const appHealth = await fetch(status.healthUrl, {
    headers: {
      Authorization: `Bearer ${originalToken}`,
      Origin: "app://local",
    },
  });
  expect(appHealth.status).toBe(200);
  expect(appHealth.headers.get("access-control-allow-origin")).toBe("app://local");

  const response = await fetch(`http://127.0.0.1:${status.port}/v1/captures?ignored=1`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${originalToken}`,
      Origin: "chrome-extension://abcdef",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      version: 1,
      kind: "page",
      url: "https://example.com/article",
      title: "Captured page",
      defuddledHtml: "<p>safe</p><script>bad()</script>",
      text: "saved before processing",
    }),
  });
  expect(response.status).toBe(201);
  const { id } = await response.json();
  expect(await library.getItem(id)).toMatchObject({
    sourceUrl: "https://example.com/article",
    title: "Captured page",
    metadata: {
      captureSource: "browser extension",
      pendingUrlCapture: { initialTitle: "Captured page", preserveTitle: true },
    },
  });
  expect(
    library.db.prepare("SELECT kind, status FROM jobs WHERE item_id = ?").get(id),
  ).toMatchObject({
    kind: "enrich_url",
    status: "pending",
  });
  expect(await library.getItemContent(id)).toEqual({ id, body: "", bodyFormat: "" });

  const nextToken = await server.regeneratePairingToken();
  expect(nextToken).not.toBe(originalToken);
  expect(
    (await fetch(status.healthUrl, { headers: { Authorization: `Bearer ${originalToken}` } }))
      .status,
  ).toBe(401);
  await server.close();
  server = await startCaptureServer({
    libraryDirectory: directory,
    captureUrl: (input) => library.captureUrl(input),
  });
  servers.push(server);
  expect(server.getPairingToken()).toBe(nextToken);
  const regeneratedHealth = await fetch(String(server.status().healthUrl), {
    headers: { Authorization: `Bearer ${nextToken}` },
  });
  expect(regeneratedHealth.status).toBe(200);
});

test("closing the receiver waits for an in-flight capture to finish", async () => {
  const directory = temporaryDirectory();
  let signalCaptureStarted!: () => void;
  let finishCapture!: (item: { id: string }) => void;
  const captureStarted = new Promise<void>((resolve) => {
    signalCaptureStarted = resolve;
  });
  const captureResult = new Promise<{ id: string }>((resolve) => {
    finishCapture = resolve;
  });
  const server = await startCaptureServer({
    libraryDirectory: directory,
    captureUrl: async () => {
      signalCaptureStarted();
      return captureResult;
    },
  });
  servers.push(server);

  const { port } = server.status();
  const responsePromise = fetch(`http://127.0.0.1:${port}/v1/captures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${server.getPairingToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: 1,
      kind: "page",
      url: "https://example.com/article",
      title: "In-flight capture",
      defuddledHtml: "",
      text: "",
    }),
  });
  await captureStarted;

  let closeFinished = false;
  const closing = server.close().then(() => {
    closeFinished = true;
  });
  await Promise.resolve();
  expect(closeFinished).toBe(false);

  finishCapture({ id: "in-flight" });
  expect((await responsePromise).status).toBe(201);
  await closing;
  expect(closeFinished).toBe(true);
});
