import type { LibraryCard } from "@inkling/contracts";
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LibraryClient } from "../library-client.ts";
import { startPhoneService } from "./server.ts";
import { isTailnetAddress } from "./tailnet.ts";

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

async function start(cards: LibraryCard[]) {
  const directory = mkdtempSync(join(tmpdir(), "inkling-phone-service-"));
  roots.push(directory);
  mkdirSync(join(directory, "assets/items/a"), { recursive: true });
  writeFileSync(join(directory, "assets/items/a/thumbnail.webp"), "webp-bytes");
  const library = {
    cards: async () => ({ cards, next: null, total: cards.length }),
    cardsById: async ({ ids }: { ids: readonly string[] }) =>
      cards.filter((c) => ids.includes(c.id)),
    search: async () => cards,
  } as unknown as LibraryClient;
  const service = await startPhoneService({
    libraryDirectory: directory,
    library: async () => library,
    hosts: ["127.0.0.1"],
    port: 0,
  });
  services.push(service);
  const base = `http://${service.addresses[0]}`;
  const get = (path: string, token = service.token(), init: RequestInit = {}) =>
    fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  return { service, get };
}

test("tailnet addresses are Tailscale's CGNAT and ULA ranges only", () => {
  for (const [address, expected] of [
    ["100.64.0.1", true],
    ["100.127.255.254", true],
    ["100.63.255.255", false],
    ["100.128.0.1", false],
    ["192.168.1.20", false],
    ["127.0.0.1", false],
    ["fd7a:115c:a1e0::a24f:d345", true],
    ["FD7A:115C:A1E0:ab12::1", true],
    ["fd00::1", false],
  ] as const)
    expect([address, isTailnetAddress(address)]).toEqual([address, expected]);
});

test("every request needs the phone token, and only GET is answered", async () => {
  const { get } = await start([]);
  expect((await get("/v1/status", "")).status).toBe(401);
  expect((await get("/v1/status", "0".repeat(64))).status).toBe(401);
  expect((await get("/v1/status", undefined, { method: "POST" })).status).toBe(405);
  expect((await get("/v1/status")).status).toBe(200);
});

test("cards leave OCR text and asset paths on the desktop", async () => {
  const { get } = await start([card("a", "assets/items/a/thumbnail.webp")]);
  const body = await (await get("/v1/cards?limit=5000")).json();
  expect(body.cards).toEqual([
    {
      id: "a",
      kind: "image",
      title: "card a",
      description: null,
      sourceUrl: null,
      createdAt: 1,
      hasThumbnail: true,
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
