import type { LibraryCard } from "@inkling/contracts";
import { itemKind } from "@inkling/ingestion/item-kind";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { hostname } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { appContentTypes } from "../app-content-types.ts";
import { serveAssetFile } from "../asset-response.ts";
import { bearerToken, tokensEqual } from "../capture/gate.ts";
import { openPairingToken } from "../capture/pairing-token.ts";
import type { LibraryClient } from "../library-client.ts";
import { tailnetAddresses } from "./tailnet.ts";

const phoneServicePort = 47_620;
const READ_TIMEOUT = 10_000;
const MAX_PAGE = 200;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const captureSource = "phone";
const activeScope = { _tag: "Active" } as const;

const positive = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const text = (value: unknown) => (typeof value === "string" ? value : undefined);

function xPost(metadata: LibraryCard["metadata"]) {
  const social = metadata.social as Record<string, unknown> | undefined;
  if (social?.provider !== "x") return null;
  return {
    name: text(social.authorName)?.trim() ?? "",
    handle: text(social.authorHandle)?.replace(/^@/u, "") ?? "",
    text: text(social.text) ?? "",
  };
}

function aspectRatio(metadata: LibraryCard["metadata"]) {
  const width = positive(metadata.mediaWidth);
  const height = positive(metadata.mediaHeight);
  return positive(metadata.mediaAspectRatio) ?? (width && height ? width / height : null);
}

// Only web images: the phone loads a link's preview straight from the site, as desktop's grid does.
const webImage = (metadata: LibraryCard["metadata"]) =>
  (Array.isArray(metadata.imageUrls) ? metadata.imageUrls : [])
    .map(text)
    .find((url) => url !== undefined && /^https?:\/\//u.test(url)) ?? null;

const phoneCard = (card: LibraryCard) => {
  const post = xPost(card.metadata);
  return {
    id: card.id,
    kind: card.kind,
    displayKind: itemKind(card.kind, card.sourceUrl, post !== null),
    title: card.title,
    description: card.description,
    sourceUrl: card.sourceUrl,
    source: card.sourceLabel,
    createdAt: card.createdAt,
    hasThumbnail: card.thumbnailPath !== null,
    imageUrl: webImage(card.metadata),
    aspectRatio: aspectRatio(card.metadata),
    post,
  };
};

function send(response: ServerResponse, status: number, value: unknown) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    Connection: "close",
  });
  response.end(body);
}

type PhoneCapture = { id: string; kind: string; text: string; file?: string };

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_CAPTURE_BYTES) return undefined;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

const isCapture = (value: unknown): value is PhoneCapture => {
  const capture = value as PhoneCapture | null;
  return (
    typeof capture?.id === "string" &&
    /^[\w-]{1,64}$/u.test(capture.id) &&
    typeof capture.text === "string" &&
    (capture.kind === "url" || capture.kind === "note" || capture.kind === "image") &&
    (capture.kind !== "image" || typeof capture.file === "string")
  );
};

/** Phone capture ids already saved, so a retried upload returns the same item instead of a copy. */
async function openCaptureLedger(path: string) {
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(await readFile(path, "utf8")) as Record<string, string>;
  } catch {}
  let queue = Promise.resolve();
  return {
    lookup: (id: string) => (Object.hasOwn(saved, id) ? saved[id] : undefined),
    // One capture at a time: a retry that races its original must find the first save here.
    run: <T>(task: () => Promise<T>) => {
      const result = queue.then(task);
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    async record(id: string, itemId: string) {
      saved = { ...saved, [id]: itemId };
      await writeFile(`${path}.tmp`, JSON.stringify(saved));
      await rename(`${path}.tmp`, path);
    },
  };
}

// The Share Sheet hands over image bytes without a type, so read it from the file header.
function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
    return { extension: "jpg", mimeType: "image/jpeg" };
  if (
    bytes
      .subarray(4, 12)
      .toString("latin1")
      .match(/^ftyp(heic|heix|mif1)/u)
  )
    return { extension: "heic", mimeType: "image/heic" };
  if (bytes.subarray(0, 4).toString("latin1") === "GIF8")
    return { extension: "gif", mimeType: "image/gif" };
  if (bytes.subarray(8, 12).toString("latin1") === "WEBP")
    return { extension: "webp", mimeType: "image/webp" };
  return { extension: "png", mimeType: "image/png" };
}

function saveCapture(client: LibraryClient, capture: PhoneCapture) {
  if (capture.kind === "url") return client.captureUrl({ sourceUrl: capture.text, captureSource });
  if (capture.kind === "note")
    return client.createNote({ body: capture.text, metadata: { captureSource } });
  const bytes = Buffer.from(capture.file ?? "", "base64");
  const type = imageType(bytes);
  const name = capture.text.trim() || "Image from phone";
  return client.saveFile({
    fileName: /\.\w{3,4}$/u.test(name) ? name : `${name}.${type.extension}`,
    mimeType: type.mimeType,
    kind: "image",
    bytes,
  });
}

const pageLimit = (value: string | null) => {
  const limit = Number(value ?? 50);
  return Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_PAGE) : 50;
};

/**
 * The phone app's service: it reads the library and saves the phone's captures. It listens only on the given hosts (the
 * tailnet addresses by default) and answers only requests holding its token.
 */
export async function startPhoneService({
  libraryDirectory,
  library,
  hosts,
  port = phoneServicePort,
}: {
  libraryDirectory: string;
  library: () => Promise<LibraryClient>;
  hosts: readonly string[];
  port?: number;
}) {
  const token = await openPairingToken(join(libraryDirectory, "phone_token"));
  const assetsDirectory = join(libraryDirectory, "assets");
  const ledger = await openCaptureLedger(join(libraryDirectory, "phone_captures.json"));

  async function respond(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://phone.invalid");
    const writes = url.pathname === "/v1/captures";
    if (request.method !== (writes ? "POST" : "GET"))
      return send(response, 405, { error: "method-not-allowed" });
    const presented = bearerToken(request.headers);
    if (!presented || !tokensEqual(presented, token.current()))
      return send(response, 401, { error: "unauthorized" });
    const client = await library();

    if (writes) {
      const capture = await readJson(request);
      if (!isCapture(capture)) return send(response, 400, { error: "invalid-capture" });
      const itemId = await ledger.run(async () => {
        const known = ledger.lookup(capture.id);
        if (known) return known;
        const { id } = await saveCapture(client, capture);
        await ledger.record(capture.id, id);
        return id;
      });
      return send(response, 200, { itemId });
    }

    if (url.pathname === "/v1/status") {
      const { total } = await client.cards({ scope: activeScope, cursor: null, limit: 1 });
      return send(response, 200, { device: hostname(), items: total });
    }
    if (url.pathname === "/v1/cards") {
      const page = await client.cards({
        scope: activeScope,
        cursor: url.searchParams.get("cursor"),
        limit: pageLimit(url.searchParams.get("limit")),
      });
      return send(response, 200, { ...page, cards: page.cards.map(phoneCard) });
    }
    if (url.pathname === "/v1/search") {
      const query = url.searchParams.get("q")?.trim();
      if (!query) return send(response, 400, { error: "missing-query" });
      const cards = await client.search({ query, limit: pageLimit(url.searchParams.get("limit")) });
      return send(response, 200, { cards: cards.map(phoneCard) });
    }
    const thumbnail = /^\/v1\/thumbnails\/([\w-]+)$/u.exec(url.pathname);
    if (thumbnail) {
      const [card] = await client.cardsById({ ids: [thumbnail[1]] });
      // The stored path is library-relative; serveAssetFile keeps it inside assets/.
      const path = card?.thumbnailPath;
      if (!path?.startsWith("assets/")) return send(response, 404, { error: "not-found" });
      const asset = await serveAssetFile(new Request("http://phone.invalid/"), {
        root: assetsDirectory,
        path: path.slice("assets".length),
        contentTypes: appContentTypes,
      });
      response.writeHead(asset.status, {
        ...Object.fromEntries(asset.headers),
        Connection: "close",
      });
      if (!asset.body) return response.end();
      // Awaited so a read failure mid-stream reaches respond's catch instead of crashing main.
      return pipeline(Readable.fromWeb(asset.body as unknown as ReadableStream), response);
    }
    send(response, 404, { error: "not-found" });
  }

  const servers: Server[] = [];
  const addresses: string[] = [];
  try {
    for (const host of hosts) {
      const server = createServer((request, response) => {
        request.setTimeout(READ_TIMEOUT, () => request.destroy());
        respond(request, response).catch((error: unknown) => {
          console.error("inkling: phone service request failed", error);
          if (!response.headersSent) send(response, 500, { error: "internal" });
          else response.destroy();
        });
      });
      server.headersTimeout = READ_TIMEOUT;
      server.requestTimeout = READ_TIMEOUT;
      servers.push(server);
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });
      const address = server.address();
      if (address && typeof address !== "string")
        addresses.push(
          address.family === "IPv6"
            ? `[${address.address}]:${address.port}`
            : `${address.address}:${address.port}`,
        );
    }
  } catch (error) {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    throw error;
  }

  return {
    addresses,
    token: token.current,
    close: () =>
      Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((resolve) =>
              server.listening ? server.close(() => resolve()) : resolve(),
            ),
        ),
      ).then(() => {}),
  };
}

/** Starts the service when INKLING_PHONE_SERVICE=1, on the tailnet unless INKLING_PHONE_SERVICE_HOST names a host. */
export async function startPhoneServiceIfEnabled(
  options: { libraryDirectory: string; library: () => Promise<LibraryClient> },
  env = process.env,
) {
  if (env.INKLING_PHONE_SERVICE !== "1") return undefined;
  const hosts = env.INKLING_PHONE_SERVICE_HOST
    ? [env.INKLING_PHONE_SERVICE_HOST]
    : tailnetAddresses();
  if (hosts.length === 0) {
    console.error("inkling: phone service needs Tailscale running; no tailnet address found");
    return undefined;
  }
  const service = await startPhoneService({ ...options, hosts });
  console.log(
    `inkling: phone service on ${service.addresses.join(", ")}; token in ${join(options.libraryDirectory, "phone_token")}`,
  );
  return service;
}
