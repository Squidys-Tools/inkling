import type { LibraryCard } from "@inkling/contracts";
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
const activeScope = { _tag: "Active" } as const;

const phoneCard = (card: LibraryCard) => ({
  id: card.id,
  kind: card.kind,
  title: card.title,
  description: card.description,
  sourceUrl: card.sourceUrl,
  createdAt: card.createdAt,
  hasThumbnail: card.thumbnailPath !== null,
});

function send(response: ServerResponse, status: number, value: unknown) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    Connection: "close",
  });
  response.end(body);
}

const pageLimit = (value: string | null) => {
  const limit = Number(value ?? 50);
  return Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_PAGE) : 50;
};

/**
 * Read-only service for the phone app. It listens only on the given hosts (the
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

  async function respond(request: IncomingMessage, response: ServerResponse) {
    if (request.method !== "GET") return send(response, 405, { error: "method-not-allowed" });
    const presented = bearerToken(request.headers);
    if (!presented || !tokensEqual(presented, token.current()))
      return send(response, 401, { error: "unauthorized" });
    const url = new URL(request.url ?? "/", "http://phone.invalid");
    const client = await library();

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
