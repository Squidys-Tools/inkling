import type { LibraryCard } from "@inkling/contracts";
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LibraryClient } from "../library-client.ts";
import { startPhoneService } from "./server.ts";
import { parseTailscaleStatus, serveRootTargets, tailscaleCli } from "./tailscale.ts";

const roots: string[] = [];
const services: Array<Awaited<ReturnType<typeof startPhoneService>>> = [];

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const card = (id: string, thumbnailPath: string | null): LibraryCard => ({
  id,
  kind: "image",
  title: `card ${id}`,
  description: null,
  sourceUrl: null,
  sourceLabel: null,
  localAssetPath: `assets/items/${id}/original.png`,
  thumbnailPath,
  ocrText: "private ocr text",
  createdAt: 1,
  archived: false,
  metadata: {},
  hasArticleContent: false,
  updatedAt: 1,
});

async function start(
  cards: LibraryCard[],
  directory = mkdtempSync(join(tmpdir(), "inkling-phone-service-")),
) {
  roots.push(directory);
  mkdirSync(join(directory, "assets/items/a"), { recursive: true });
  writeFileSync(join(directory, "assets/items/a/thumbnail.webp"), "webp-bytes");
  const library = {
    cards: async ({ scope }: { scope: unknown }) => {
      scopes.push(scope);
      return { cards, next: null, total: cards.length };
    },
    spaces: async () => [
      {
        id: "s1",
        name: "Read later",
        color: "blue",
        kind: "regular",
        query: {},
        position: 0,
        createdAt: 1,
        updatedAt: 1,
        itemCount: 3,
      },
      {
        id: "s2",
        name: "Mountains",
        color: "green",
        kind: "smart",
        query: { text: "mountain" },
        position: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    cardsById: async ({ ids }: { ids: readonly string[] }) =>
      cards.filter((c) => ids.includes(c.id)),
    search: async () => cards,
    captureUrl: async (input: unknown) => save(input),
    createNote: async (input: unknown) => save(input),
    saveFile: async (input: unknown) => save(input),
  } as unknown as LibraryClient;
  const saves: unknown[] = [];
  const scopes: unknown[] = [];
  // The first save waits for a second request to reach the service, so a retry overlaps it.
  let requests = 0;
  let secondRequest = () => {};
  const overlapped = new Promise<void>((resolve) => (secondRequest = resolve));
  const save = async (input: unknown) => {
    saves.push(input);
    if (saves.length === 1) await overlapped;
    return { id: `item-${saves.length}` };
  };
  const service = await startPhoneService({
    libraryDirectory: directory,
    library: async () => {
      if (++requests === 2) secondRequest();
      return library;
    },
    port: 0,
  });
  services.push(service);
  const base = `http://127.0.0.1:${service.port}`;
  const get = (path: string, token = service.token(), init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  const post = (path: string, body: BodyInit) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${service.token()}` },
      body,
    });
  return { service, get, post, saves, scopes, directory };
}

test("Serve is published only where no other live server answers, and the CLI is found off PATH", () => {
  const serve = (proxy: string) =>
    JSON.stringify({ Web: { "box.ts.net:8443": { Handlers: { "/": { Proxy: proxy } } } } });
  for (const [json, expected] of [
    ["null", []],
    ["", []],
    [serve("http://127.0.0.1:47620"), [47_620]],
    [serve("http://localhost:3000/"), [3000]],
    // A file or remote handler can't be probed, so it counts as taken.
    [serve("/var/www"), [null]],
    [
      JSON.stringify({
        Web: { "box.ts.net:443": { Handlers: { "/": { Proxy: "http://127.0.0.1:1" } } } },
      }),
      [],
    ],
  ] as const)
    expect([json, serveRootTargets(json, 8443)]).toEqual([json, [...expected]]);

  const status = (self: object, state = "Running") =>
    JSON.stringify({ BackendState: state, Self: self });
  expect(
    parseTailscaleStatus(status({ DNSName: "box.tail1.ts.net.", CapMap: { https: null } })),
  ).toEqual({
    running: true,
    magicDnsName: "box.tail1.ts.net",
    https: true,
  });
  expect(parseTailscaleStatus(status({ DNSName: "", CapMap: {} }, "Stopped"))).toEqual({
    running: false,
    magicDnsName: null,
    https: false,
  });

  const app = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  expect(tailscaleCli("darwin", (path) => path === app)).toBe(app);
  expect(tailscaleCli("darwin", () => false)).toBe("tailscale");
  expect(tailscaleCli("linux", () => true)).toBe("tailscale");
});

test("every request needs the phone token, and only GET is answered", async () => {
  const { get } = await start([]);
  expect((await get("/v1/status", "")).status).toBe(401);
  expect((await get("/v1/status", "0".repeat(64))).status).toBe(401);
  expect((await get("/v1/status", undefined, { method: "POST" })).status).toBe(405);
  expect((await get("/v1/status")).status).toBe(200);
});

test("cards leave OCR text and asset paths on the desktop", async () => {
  const link = {
    ...card("link", null),
    kind: "url",
    sourceUrl: "https://example.com/a",
    sourceLabel: "example.com",
    // A local image path stays on the desktop; only the web image goes to the phone.
    metadata: {
      imageUrls: ["assets/items/link/cover.jpg", "https://example.com/cover.jpg"],
      mediaWidth: 300,
      mediaHeight: 200,
    },
  };
  const x = {
    ...card("x", null),
    kind: "url",
    sourceUrl: "https://x.com/a/status/1",
    sourceLabel: "x.com",
    metadata: { social: { provider: "x", authorName: "Ada", authorHandle: "@ada", text: "hello" } },
  };
  const { get } = await start([card("a", "assets/items/a/thumbnail.webp"), link, x]);
  const body = await (await get("/v1/cards?limit=5000")).json();
  expect(body.cards).toEqual([
    {
      id: "a",
      kind: "image",
      displayKind: "Image",
      title: "card a",
      description: null,
      sourceUrl: null,
      source: null,
      createdAt: 1,
      hasThumbnail: true,
      thumbnailVersion: 1,
      imageUrl: null,
      aspectRatio: null,
      post: null,
    },
    {
      id: "link",
      kind: "url",
      displayKind: "Article",
      title: "card link",
      description: null,
      sourceUrl: "https://example.com/a",
      source: "example.com",
      createdAt: 1,
      hasThumbnail: false,
      thumbnailVersion: null,
      imageUrl: "https://example.com/cover.jpg",
      aspectRatio: 1.5,
      post: null,
    },
    {
      id: "x",
      kind: "url",
      displayKind: "Post",
      title: "card x",
      description: null,
      sourceUrl: "https://x.com/a/status/1",
      source: "x.com",
      createdAt: 1,
      hasThumbnail: false,
      thumbnailVersion: null,
      imageUrl: null,
      aspectRatio: null,
      post: { name: "Ada", handle: "ada", text: "hello" },
    },
  ]);
  expect((await get("/v1/search")).status).toBe(400);
});

test("a thumbnail is served by item id and never from outside assets/", async () => {
  const { get } = await start([
    card("a", "assets/items/a/thumbnail.webp"),
    card("b", "assets/../phone_token"),
    card("c", "phone_token"),
  ]);
  const served = await get("/v1/thumbnails/a");
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("image/webp");
  expect(await served.text()).toBe("webp-bytes");
  for (const id of ["b", "c", "missing", "..%2Fphone_token"]) {
    const response = await get(`/v1/thumbnails/${id}`);
    expect([id, response.status === 200]).toEqual([id, false]);
  }
});

test("a retried phone capture returns the first save instead of a copy, across restarts", async () => {
  const first = await start([]);
  const url = "/v1/captures/cap-1?kind=url";
  const answers = await Promise.all([
    first.post(url, "https://example.com/a"),
    first.post(url, "https://example.com/a"),
  ]);
  expect(await Promise.all(answers.map((answer) => answer.json()))).toEqual([
    { itemId: "item-1" },
    { itemId: "item-1" },
  ]);
  expect(first.saves).toEqual([{ sourceUrl: "https://example.com/a", captureSource: "phone" }]);
  await first.service.close();

  const again = await start([], first.directory);
  expect(await (await again.post(url, "https://example.com/a")).json()).toEqual({
    itemId: "item-1",
  });
  expect(again.saves).toEqual([]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  await again.post("/v1/captures/cap-2?kind=image&name=IMG_0005", jpeg);
  await again.post("/v1/captures/cap-3?kind=note", "a shared line");
  expect(again.saves).toEqual([
    { fileName: "IMG_0005.jpg", mimeType: "image/jpeg", kind: "image", bytes: expect.anything() },
    { body: "a shared line", metadata: { captureSource: "phone" } },
  ]);
  expect((again.saves[0] as { bytes: Buffer }).bytes).toEqual(Buffer.from(jpeg));
  // regression: an id naming an Object.prototype member was taken as already saved.
  expect(
    await (await again.post("/v1/captures/constructor?kind=url", "https://example.com/a")).json(),
  ).toEqual({
    itemId: "item-3",
  });
  for (const bad of [
    "/v1/captures/..%2Fx?kind=url",
    "/v1/captures/cap-4?kind=pdf",
    "/v1/captures/cap-5",
  ])
    expect((await again.post(bad, "x")).status).toBe(400);
  expect((await again.post("/v1/captures/cap-6?kind=image", new Uint8Array())).status).toBe(400);
  expect((await again.get("/v1/captures/cap-1")).status).toBe(405);
  expect((await again.post("/v1/cards", "x")).status).toBe(405);
});

test("an upload over the cap is refused with 413 before or while it is read", async () => {
  const { post, saves } = await start([]);
  const big = new Uint8Array(32 * 1024 * 1024 + 1);
  expect((await post("/v1/captures/big-1?kind=image", big)).status).toBe(413);
  const streamed = new ReadableStream({
    start(controller) {
      controller.enqueue(big);
      controller.close();
    },
  });
  expect((await post("/v1/captures/big-2?kind=image", streamed)).status).toBe(413);
  expect(saves).toEqual([]);
});

test("the sidebar's Spaces and Archive reach the phone as card scopes", async () => {
  const { get, scopes } = await start([]);
  expect(await (await get("/v1/spaces")).json()).toEqual({
    spaces: [
      { id: "s1", name: "Read later", color: "blue", kind: "regular", itemCount: 3 },
      { id: "s2", name: "Mountains", color: "green", kind: "smart", itemCount: null },
    ],
  });
  for (const path of ["/v1/cards", "/v1/cards?archived=1", "/v1/cards?space=s2"]) await get(path);
  expect(scopes).toEqual([
    { _tag: "Active" },
    { _tag: "Archived" },
    { _tag: "Space", spaceId: "s2" },
  ]);
});
