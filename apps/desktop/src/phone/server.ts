import type { LibraryCard } from "@inkling/contracts";
import { itemKind } from "@inkling/ingestion/item-kind";
import { readFile, rename, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
import { disableTailscaleServe, ensureTailscaleServe, TailscaleError } from "./tailscale.ts";

const phoneServicePort = 47_620;
const HEADERS_TIMEOUT = 10_000;
// An idle socket closes after this; a large upload over a relayed tailnet may take minutes in total.
const IDLE_TIMEOUT = 30_000;
const UPLOAD_TIMEOUT = 10 * 60_000;
const MAX_PAGE = 200;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const captureSource = "phone";
const activeScope = { _tag: "Active" } as const;

/** `?archived=1` or `?space=<id>` pick what the sidebar picked; everything else is the active library. */
function cardScope(params: URLSearchParams) {
  const space = params.get("space");
  if (space) return { _tag: "Space", spaceId: space } as const;
  if (params.get("archived") === "1") return { _tag: "Archived" } as const;
  return activeScope;
}

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
    // Desktop rewrites thumbnail.webp in place, so the phone keys its image cache on this.
    thumbnailVersion: card.thumbnailPath === null ? null : card.updatedAt,
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

/**
 * `POST /v1/captures/<id>?kind=url|note|image[&name=…]`. A URL or note is its UTF-8 text as the body;
 * an image is its raw bytes.
 */
type PhoneCapture = { id: string; kind: "url" | "note" | "image"; name: string; body: Buffer };

function captureTarget(url: URL) {
  const id = /^\/v1\/captures\/([\w-]{1,64})$/u.exec(url.pathname)?.[1];
  const kind = url.searchParams.get("kind");
  if (!id || (kind !== "url" && kind !== "note" && kind !== "image")) return undefined;
  return { id, kind, name: url.searchParams.get("name")?.trim() ?? "" } as const;
}

/** The body, or `undefined` once it passes the cap, so the caller can answer 413. */
async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_CAPTURE_BYTES) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const LEDGER_LIMIT = 1000;

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
      // Only a capture still in a phone's outbox can retry, so the newest ids are enough.
      saved = Object.fromEntries([...Object.entries(saved), [id, itemId]].slice(-LEDGER_LIMIT));
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
  const text = capture.body.toString("utf8").trim();
  if (capture.kind === "url") return client.captureUrl({ sourceUrl: text, captureSource });
  if (capture.kind === "note")
    return client.createNote({ body: text, metadata: { captureSource } });
  const bytes = capture.body;
  const type = imageType(bytes);
  const name = capture.name || "Image from phone";
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
 * The phone app's service: it reads the library and saves the phone's captures. It listens on loopback only, where
 * Tailscale Serve proxies the tailnet to it, and answers only requests holding its token.
 */
export async function startPhoneService({
  libraryDirectory,
  library,
  port = phoneServicePort,
}: {
  libraryDirectory: string;
  library: () => Promise<LibraryClient>;
  port?: number;
}) {
  const token = await openPairingToken(join(libraryDirectory, "phone_token"));
  const assetsDirectory = join(libraryDirectory, "assets");
  const ledger = await openCaptureLedger(join(libraryDirectory, "phone_captures.json"));

  async function respond(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://phone.invalid");
    const writes = url.pathname.startsWith("/v1/captures/");
    if (request.method !== (writes ? "POST" : "GET"))
      return send(response, 405, { error: "method-not-allowed" });
    const presented = bearerToken(request.headers);
    if (!presented || !tokensEqual(presented, token.current()))
      return send(response, 401, { error: "unauthorized" });
    const client = await library();

    if (writes) {
      const target = captureTarget(url);
      if (!target) return send(response, 400, { error: "invalid-capture" });
      if (Number(request.headers["content-length"] ?? 0) > MAX_CAPTURE_BYTES)
        return send(response, 413, { error: "too-large" });
      const body = await readBody(request);
      if (!body) return send(response, 413, { error: "too-large" });
      if (body.length === 0) return send(response, 400, { error: "invalid-capture" });
      const capture = { ...target, body };
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
    if (url.pathname === "/v1/spaces") {
      const spaces = await client.spaces({});
      return send(response, 200, {
        spaces: spaces.map(({ id, name, color, kind, itemCount }) => ({
          id,
          name,
          color,
          kind,
          itemCount: itemCount ?? null,
        })),
      });
    }
    if (url.pathname === "/v1/cards") {
      const page = await client.cards({
        scope: cardScope(url.searchParams),
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

  const server = createServer((request, response) => {
    request.setTimeout(IDLE_TIMEOUT, () => request.destroy());
    respond(request, response).catch((error: unknown) => {
      console.error("inkling: phone service request failed", error);
      if (!response.headersSent) send(response, 500, { error: "internal" });
      else response.destroy();
    });
  });
  server.headersTimeout = HEADERS_TIMEOUT;
  server.requestTimeout = UPLOAD_TIMEOUT;
  const listen = (at: number) =>
    new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(at, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });
  // Another inkling, or a dev build beside the installed app, may hold the usual port.
  await listen(port).catch((error: NodeJS.ErrnoException) =>
    error.code === "EADDRINUSE" ? listen(0) : Promise.reject(error),
  );
  const address = server.address();
  const boundPort = address && typeof address !== "string" ? address.port : port;

  return {
    port: boundPort,
    token: token.current,
    close: () =>
      new Promise<void>((resolve) =>
        server.listening ? server.close(() => resolve()) : resolve(),
      ),
  };
}

/**
 * Starts the service when INKLING_PHONE_SERVICE=1 and publishes it on the tailnet with Tailscale Serve.
 * The service stays up on loopback when Tailscale can't publish it, so a later start can.
 */
export async function startPhoneServiceIfEnabled(
  options: { libraryDirectory: string; library: () => Promise<LibraryClient> },
  env = process.env,
) {
  if (env.INKLING_PHONE_SERVICE !== "1") return undefined;
  const service = await startPhoneService(options);
  const baseUrl = await ensureTailscaleServe(service.port).catch((error: unknown) => {
    const reason = error instanceof TailscaleError ? error.reason : "failed";
    console.error(`inkling: the phone service is not on the tailnet (${reason})`);
    return undefined;
  });
  if (baseUrl)
    console.log(
      `inkling: phone service at ${baseUrl}; token in ${join(options.libraryDirectory, "phone_token")}`,
    );
  return {
    ...service,
    close: async () => {
      if (baseUrl) await disableTailscaleServe();
      await service.close();
    },
  };
}
