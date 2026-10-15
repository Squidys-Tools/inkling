import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLibraryStorage } from "./storage.mjs";
import { captureServerInternals, MAX_JSON_BYTES, startCaptureServer } from "./capture-server.mjs";

const roots: string[] = [];
const servers: Array<Awaited<ReturnType<typeof startCaptureServer>>> = [];
const libraries: ReturnType<typeof openLibraryStorage>[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "inkling-electron-capture-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  for (const library of libraries.splice(0)) library.db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("capture server parity", () => {
  test("bearer tokens require the exact value", () => {
    expect(captureServerInternals.bearerToken({ authorization: "Bearer abc123" })).toBe("abc123");
    expect(captureServerInternals.tokensEqual("abc123", "abc123")).toBe(true);
    expect(captureServerInternals.tokensEqual("abc123", "abc124")).toBe(false);
    expect(captureServerInternals.tokensEqual("abc123", "abc1234")).toBe(false);
    expect(captureServerInternals.bearerToken({ authorization: "Basic abc" })).toBeNull();
    expect(captureServerInternals.bearerToken({})).toBeNull();
  });

  test("only extension, null, and desktop origins pass", () => {
    for (const allowed of [
      undefined,
      "null",
      "chrome-extension://abcdef",
      "moz-extension://1234-uuid",
      "safari-web-extension://com.example.clip",
      "tauri://localhost",
      "https://tauri.localhost",
      "http://tauri.localhost",
      "app://local",
      "inkling://capture?url=https://example.com",
    ]) {
      expect(captureServerInternals.originAllowed(allowed)).toBe(true);
    }
    for (const denied of [
      "https://example.com",
      "http://localhost:3000",
      "http://127.0.0.1:1420",
      "file://",
      "nullified",
      "chrome-extension-fake://x",
      "chrome-extension://abc/path",
      "https://tauri.localhost.evil",
    ]) {
      expect(captureServerInternals.originAllowed(denied)).toBe(false);
    }
  });

  test("capture URLs match storage's HTTP guards and allow explicit loopback saves", () => {
    expect(captureServerInternals.validateCaptureUrl("http://127.0.0.1:3000/dev-notes")).toBe(
      "http://127.0.0.1:3000/dev-notes",
    );
    expect(captureServerInternals.validateCaptureUrl("https://example.com/article?q=1")).toBe(
      "https://example.com/article?q=1",
    );
    for (const invalid of [
      "ftp://example.com/file",
      "https://user:pass@example.com/",
      "not a url",
      "",
      `https://example.com/${"a".repeat(9_000)}`,
    ]) {
      expect(() => captureServerInternals.validateCaptureUrl(invalid)).toThrow();
    }
  });

  test("v1 payload normalization and Rust scrubber vectors stay in parity", () => {
    const good = {
      version: 1,
      kind: "page",
      url: "https://example.com/article",
      title: "A quiet page",
      defuddledHtml: "<p>kept</p><script>alert(1)</script>",
      text: "kept text",
      author: "A Writer",
      publishedDate: "2026-01-02T00:00:00Z",
      imageUrls: [
        "https://example.com/img.jpg",
        "javascript:evil()",
        "https://example.com/img.jpg",
      ],
    };
    const input = captureServerInternals.validateCapturePayload(Buffer.from(JSON.stringify(good)));
    expect(input.sourceUrl).toBe("https://example.com/article");
    expect(input.title).toBe("A quiet page");
    expect(input.metadata).toMatchObject({
      origin: "browser-extension",
      payloadVersion: 1,
      author: "A Writer",
      imageUrls: ["https://example.com/img.jpg"],
    });
    expect(input.metadata.html).toContain("<p>kept</p>");
    expect(input.metadata.html).not.toContain("script");

    const blankTitle = captureServerInternals.validateCapturePayload(
      Buffer.from(
        JSON.stringify({
          version: 1,
          kind: "page",
          url: "https://www.example.com/post",
          title: "  ",
          defuddledHtml: "",
          text: "words",
        }),
      ),
    );
    expect(blankTitle.title).toBe("www.example.com");

    const longTitle = captureServerInternals.validateCapturePayload(
      Buffer.from(
        JSON.stringify({
          version: 1,
          kind: "page",
          url: "https://example.com/",
          title: "t".repeat(600),
          defuddledHtml: "",
          text: "",
        }),
      ),
    );
    expect(longTitle.title).toBe("t".repeat(500));

    for (const invalid of [
      { title: "no url" },
      { version: 1, kind: "page", url: "javascript:alert(1)" },
      { version: 2, kind: "page", url: "https://example.com/" },
      { version: 1, kind: "selection", url: "https://example.com/" },
      null,
    ]) {
      expect(() =>
        captureServerInternals.validateCapturePayload(Buffer.from(JSON.stringify(invalid))),
      ).toThrow();
    }
    expect(() => captureServerInternals.validateCapturePayload(Buffer.from("not json"))).toThrow();
  });

  test("scrubber removes the executable subset and preserves safe article markup", () => {
    const dirty = [
      "<!-- a comment -->",
      '<p onclick="evil()" style="color:red">Hi <a href="javascript:alert(1)">x</a></p>',
      "<script>alert(1)</script>",
      "<style>p{}</style>",
      '<form action="https://example.com/submit"><input></form>',
      '<iframe src="https://evil.example/x"></iframe>',
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123" allowfullscreen></iframe>',
      '<img src="https://example.com/a.jpg" srcset="a 1x" onerror="e()">',
      '<a href="/relative/path">rel</a>',
      '<a href="https://example.com/abs">abs</a>',
    ].join("");
    const clean = captureServerInternals.scrubExtensionHtml(dirty, "https://example.com/article");
    for (const banned of [
      "<script",
      "onclick",
      "style=",
      "javascript:",
      "<form",
      "evil.example",
      "allowfullscreen",
      "srcset",
      "onerror",
      "<!--",
    ]) {
      expect(clean).not.toContain(banned);
    }
    for (const kept of [
      "<p>Hi",
      "https://www.youtube-nocookie.com/embed/abc123",
      "https://example.com/a.jpg",
      "/relative/path",
      "https://example.com/abs",
    ]) {
      expect(clean).toContain(kept);
    }
  });

  test("token generation, rate limiting, and payload cap match the Rust receiver", () => {
    const token = "a".repeat(64);
    expect(captureServerInternals.tokenLooksValid(token)).toBe(true);
    expect(captureServerInternals.tokenLooksValid("short")).toBe(false);
    expect(captureServerInternals.tokenLooksValid("has spaces in it yes indeed 1234567890")).toBe(
      false,
    );
    expect(MAX_JSON_BYTES).toBe(5 * 1024 * 1024);

    let now = 10_000;
    const allowRequest = captureServerInternals.createRateLimiter(() => now);
    for (let index = 0; index < 60; index += 1) expect(allowRequest()).toBe(true);
    expect(allowRequest()).toBe(false);
    now += 60_000;
    expect(allowRequest()).toBe(true);
  });
});

test("loopback capture uses a persisted bearer token and creates a pending storage item", async () => {
  const directory = temporaryDirectory();
  const library = openLibraryStorage(join(directory, "library.sqlite3"));
  libraries.push(library);
  let server = await startCaptureServer({
    libraryDirectory: directory,
    createUrl: (input) => library.createUrl(input),
  });
  servers.push(server);

  const status = server.status();
  expect(status.running).toBe(true);
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
  expect(library.getItem(id)).toMatchObject({
    sourceUrl: "https://example.com/article",
    title: "Captured page",
    metadata: {
      text: "saved before processing",
      html: "<p>safe</p>",
      origin: "browser-extension",
    },
  });
  expect(
    library.db.prepare("SELECT kind, status FROM jobs WHERE item_id = ?").get(id),
  ).toMatchObject({
    kind: "generate_embedding",
    status: "pending",
  });

  const nextToken = await server.regeneratePairingToken();
  expect(nextToken).not.toBe(originalToken);
  expect(
    (await fetch(status.healthUrl, { headers: { Authorization: `Bearer ${originalToken}` } }))
      .status,
  ).toBe(401);
  await server.close();
  server = await startCaptureServer({
    libraryDirectory: directory,
    createUrl: (input) => library.createUrl(input),
  });
  servers.push(server);
  expect(server.getPairingToken()).toBe(nextToken);
  expect(
    (
      await fetch(server.status().healthUrl, {
        headers: { Authorization: `Bearer ${nextToken}` },
      })
    ).status,
  ).toBe(200);
});
