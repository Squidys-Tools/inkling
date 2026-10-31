import type { CaptureReceiver } from "@inkling/contracts/desktop";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { bearerToken, corsHeaders, createRateLimiter, originAllowed, tokensEqual } from "./gate.ts";
import { validateCapturePayload } from "./payload.ts";
import { openPairingToken } from "./pairing-token.ts";

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_HEAD_BYTES = 64 * 1024;
const READ_TIMEOUT = 10_000;
const HEALTH_PATH = "/v1/health";
const CAPTURES_PATH = "/v1/captures";

function send(
  response: ServerResponse,
  status: number,
  statusText: string,
  headers: Record<string, string>,
  value?: unknown,
) {
  const body = Buffer.from(value === undefined ? "" : JSON.stringify(value), "utf8");
  response.writeHead(status, statusText, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    Connection: "close",
    ...headers,
  });
  response.end(body);
}

function requestPath(target: string) {
  const stripped = target.split(/[?#]/u, 1)[0];
  if (stripped.includes("://")) {
    try {
      return new URL(stripped).pathname;
    } catch {
      return stripped;
    }
  }
  return stripped;
}

async function readBody(request: IncomingMessage) {
  const declaredLength = request.headers["content-length"];
  const contentLength = declaredLength === undefined ? 0 : Number(declaredLength);
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_JSON_BYTES
  ) {
    throw new Error("body-too-large");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= MAX_JSON_BYTES) chunks.push(chunk);
  }
  if (length > MAX_JSON_BYTES) throw new Error("body-too-large");
  if (length !== contentLength) throw new Error("bad-request");
  return Buffer.concat(chunks, length);
}

type CaptureUrl = (input: {
  sourceUrl: string;
  title?: string;
  captureSource: string;
}) => Promise<{ id: string } | null | undefined>;

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  {
    token,
    allowRequest,
    captureUrl,
  }: { token: string; allowRequest: () => boolean; captureUrl: CaptureUrl },
) {
  const origin = request.headers.origin;
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") {
    send(response, 204, "No Content", {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    });
    return;
  }
  if (!originAllowed(origin)) {
    send(response, 403, "Forbidden", cors, { error: "origin-not-allowed" });
    return;
  }
  const presentedToken = bearerToken(request.headers);
  if (!presentedToken || !tokensEqual(presentedToken, token)) {
    send(response, 401, "Unauthorized", cors, { error: "unauthorized" });
    return;
  }
  if (!allowRequest()) {
    send(
      response,
      429,
      "Too Many Requests",
      { ...cors, "Retry-After": "60" },
      { error: "rate-limited" },
    );
    return;
  }
  const path = requestPath(request.url ?? "/");
  if (request.method === "GET" && path === HEALTH_PATH) {
    send(response, 200, "OK", cors, { status: "ok" });
    return;
  }
  if (request.method !== "POST" || path !== CAPTURES_PATH) {
    send(response, 404, "Not Found", cors, { error: "not-found" });
    return;
  }
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    send(response, 415, "Unsupported Media Type", cors, { error: "json-only" });
    return;
  }
  let body: Buffer;
  try {
    body = await readBody(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bad-request";
    const tooLarge = reason === "body-too-large";
    send(response, tooLarge ? 413 : 400, tooLarge ? "Payload Too Large" : "Bad Request", cors, {
      error: tooLarge ? "body-too-large" : "bad-request",
    });
    return;
  }
  let input: ReturnType<typeof validateCapturePayload>;
  try {
    input = validateCapturePayload(body);
  } catch (error) {
    send(response, 422, "Unprocessable Entity", cors, {
      error: "invalid-capture",
      message: error instanceof Error ? error.message : "invalid capture payload",
    });
    return;
  }
  try {
    const item = await captureUrl({
      sourceUrl: input.sourceUrl,
      title: input.title,
      captureSource: "browser extension",
    });
    if (!item?.id) throw new Error("storage returned no item id");
    send(response, 201, "Created", cors, { id: item.id });
  } catch {
    send(response, 503, "Unavailable", cors, { error: "storage-unavailable" });
  }
}

/**
 * The loopback receiver the browser extension posts pages to. It answers only
 * extension origins holding the pairing token, and saves through `captureUrl`.
 */
export async function startCaptureServer({
  libraryDirectory,
  captureUrl,
}: {
  libraryDirectory: string;
  captureUrl: CaptureUrl;
}) {
  const pairing = await openPairingToken(join(libraryDirectory, "pairing_token"));
  const allowRequest = createRateLimiter();
  const server = createServer({ maxHeaderSize: MAX_HEAD_BYTES }, (request, response) => {
    request.setTimeout(READ_TIMEOUT, () => {
      if (!response.headersSent) {
        send(response, 400, "Bad Request", {}, { error: "bad-request" });
      }
      request.destroy();
    });
    void handleRequest(request, response, {
      token: pairing.current(),
      allowRequest,
      captureUrl,
    });
  });
  server.headersTimeout = READ_TIMEOUT;
  server.requestTimeout = READ_TIMEOUT;
  server.keepAliveTimeout = 1_000;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const status = (): CaptureReceiver => {
    const address = server.address();
    if (!server.listening || !address || typeof address === "string")
      return { running: false, port: null };
    return { running: true, port: address.port };
  };

  return {
    status,
    getPairingToken: pairing.current,
    regeneratePairingToken: pairing.regenerate,
    async answersHealthCheck() {
      const { port } = status();
      if (port === null) return false;
      try {
        const response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, {
          headers: { Authorization: `Bearer ${pairing.current()}` },
          signal: AbortSignal.timeout(READ_TIMEOUT),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    close() {
      if (!server.listening) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
