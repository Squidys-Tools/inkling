import type { CaptureReceiver } from "@inkling/contracts/desktop";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { captureReceiverPorts } from "@inkling/contracts/capture";
import {
  bearerToken,
  corsHeaders,
  createRateLimiter,
  extensionOrigin,
  hostAllowed,
  originAllowed,
  tokensEqual,
} from "./gate.ts";
import { createPairRequests } from "./pair-requests.ts";
import type { DeepLinkCapture } from "./deep-link.ts";
import { validateCapturePayload } from "./payload.ts";
import { openPairingToken } from "./pairing-token.ts";

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_HEAD_BYTES = 64 * 1024;
const READ_TIMEOUT = 10_000;
const SAVE_TIMEOUT = 45_000;
const HEALTH_PATH = "/v1/health";
const CAPTURES_PATH = "/v1/captures";
const PAIR_PATH = "/v1/pair";

function send(
  response: ServerResponse,
  status: number,
  headers: Record<string, string>,
  value?: unknown,
) {
  const body = Buffer.from(value === undefined ? "" : JSON.stringify(value), "utf8");
  response.writeHead(status, {
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

type SaveCapture = (capture: DeepLinkCapture) => Promise<{ id: string }>;

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  {
    token,
    allowRequest,
    save,
    pairing,
  }: {
    token: string;
    allowRequest: () => boolean;
    save: SaveCapture;
    pairing: ReturnType<typeof createPairRequests>;
  },
) {
  const origin = request.headers.origin;
  const cors = corsHeaders(origin);
  if (!hostAllowed(request.headers.host, request.socket.localPort ?? 0)) {
    send(response, 403, {}, { error: "host-not-allowed" });
    return;
  }
  if (request.method === "OPTIONS") {
    send(response, 204, {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    });
    return;
  }
  if (!originAllowed(origin)) {
    send(response, 403, cors, { error: "origin-not-allowed" });
    return;
  }
  const path = requestPath(request.url ?? "/");
  // Pairing is how the extension gets the token, so it cannot ask for one. The user's
  // approval in the app is its gate, and the request id is the secret that reads the answer.
  if (path === PAIR_PATH || path.startsWith(`${PAIR_PATH}/`)) {
    if (request.method === "POST" && path === PAIR_PATH) {
      if (!extensionOrigin(origin)) {
        send(response, 403, cors, { error: "origin-not-allowed" });
      } else if (!allowRequest()) {
        send(response, 429, { ...cors, "Retry-After": "60" }, { error: "rate-limited" });
      } else {
        const id = pairing.start();
        if (id) send(response, 202, cors, { app: "inkling", id });
        else send(response, 409, cors, { error: "pairing-cancelled" });
      }
    } else if (request.method === "GET") {
      // Not rate-limited: the extension asks every second for as long as the user takes.
      const status = pairing.read(path.slice(PAIR_PATH.length + 1));
      if (!status) send(response, 404, cors, { error: "not-found" });
      else send(response, 200, cors, status === "approved" ? { status, token } : { status });
    } else {
      send(response, 404, cors, { error: "not-found" });
    }
    return;
  }
  const presentedToken = bearerToken(request.headers);
  if (!presentedToken || !tokensEqual(presentedToken, token)) {
    send(response, 401, cors, { error: "unauthorized" });
    return;
  }
  if (!allowRequest()) {
    send(response, 429, { ...cors, "Retry-After": "60" }, { error: "rate-limited" });
    return;
  }
  if (request.method === "GET" && path === HEALTH_PATH) {
    send(response, 200, cors, { status: "ok" });
    return;
  }
  if (request.method !== "POST" || path !== CAPTURES_PATH) {
    send(response, 404, cors, { error: "not-found" });
    return;
  }
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    send(response, 415, cors, { error: "json-only" });
    return;
  }
  let body: Buffer;
  try {
    body = await readBody(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bad-request";
    const tooLarge = reason === "body-too-large";
    send(response, tooLarge ? 413 : 400, cors, {
      error: tooLarge ? "body-too-large" : "bad-request",
    });
    return;
  }
  let capture: DeepLinkCapture;
  try {
    capture = validateCapturePayload(body);
  } catch (error) {
    send(response, 422, cors, {
      error: "invalid-capture",
      message: error instanceof Error ? error.message : "invalid capture payload",
    });
    return;
  }
  // The whole request is in, and an image capture downloads for up to 30 seconds
  // before it answers, so the idle timer that guards reading must not cut it off.
  // It stays bounded: quitting waits for this request.
  request.setTimeout(SAVE_TIMEOUT);
  try {
    const { id } = await save(capture);
    send(response, 201, cors, { id });
  } catch {
    send(response, 503, cors, { error: "storage-unavailable" });
  }
}

/**
 * The loopback receiver the browser extension posts captures to. It answers
 * only extension origins holding the pairing token, and saves through `save`.
 * `approvePairing` asks the user whether an extension may be handed that token.
 */
export async function startCaptureServer({
  libraryDirectory,
  save,
  approvePairing,
  ports = captureReceiverPorts,
}: {
  libraryDirectory: string;
  save: SaveCapture;
  approvePairing: (signal: AbortSignal) => Promise<boolean>;
  ports?: readonly number[];
}) {
  const pairing = await openPairingToken(join(libraryDirectory, "pairing_token"));
  const pairRequests = createPairRequests(approvePairing);
  const allowRequest = createRateLimiter();
  const server = createServer({ maxHeaderSize: MAX_HEAD_BYTES }, (request, response) => {
    request.setTimeout(READ_TIMEOUT, () => {
      if (!response.headersSent) {
        send(response, 400, {}, { error: "bad-request" });
      }
      request.destroy();
    });
    void handleRequest(request, response, {
      token: pairing.current(),
      allowRequest,
      save,
      pairing: pairRequests,
    });
  });
  server.headersTimeout = READ_TIMEOUT;
  server.requestTimeout = READ_TIMEOUT;
  server.keepAliveTimeout = 1_000;
  // Any free port when the known ones are taken: the app's own check still works,
  // and the extension, which cannot find it, saves through the capture link.
  for (const port of [...ports, 0]) {
    const listening = Promise.withResolvers<boolean>();
    const refused = () => listening.resolve(false);
    server.once("error", refused);
    server.listen(port, "127.0.0.1", () => listening.resolve(true));
    const bound = await listening.promise;
    server.removeListener("error", refused);
    if (bound) break;
    if (port === 0) throw new Error("no loopback port is free");
  }

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
      pairRequests.cancel();
      if (!server.listening) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
