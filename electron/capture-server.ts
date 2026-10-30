import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, join } from "node:path";
import { Schema } from "effect";

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_HEAD_BYTES = 64 * 1024;
const MAX_DEFUDDLED_HTML_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW = 60_000;
const READ_TIMEOUT = 10_000;
const HEALTH_PATH = "/v1/health";
const CAPTURES_PATH = "/v1/captures";
const TOKEN_FILE_NAME = "pairing_token";

function validateCaptureUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed || Buffer.byteLength(trimmed, "utf8") > 8_192) {
    throw new Error("url must be 1-8192 characters");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("url could not be parsed");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("only HTTP and HTTPS URLs can be saved");
  }
  if (!parsed.hostname) throw new Error("url must include a host");
  if (parsed.username || parsed.password) throw new Error("url must not contain credentials");
  return parsed.toString();
}

function checkLength(value: string | null | undefined, max: number, field: string) {
  if (value && Buffer.byteLength(value.trim(), "utf8") > max) {
    throw new Error(`${field} must be at most ${max} characters`);
  }
}

const CapturePayload = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 })),
    kind: Schema.String,
    url: Schema.String,
    title: Schema.optionalKey(Schema.String),
    defuddledHtml: Schema.optionalKey(Schema.String),
    text: Schema.optionalKey(Schema.String),
    author: Schema.optionalKey(Schema.NullOr(Schema.String)),
    publishedDate: Schema.optionalKey(Schema.NullOr(Schema.String)),
    imageUrls: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
);
const decodeCapturePayload = Schema.decodeUnknownSync(CapturePayload);

function validateCapturePayload(body: Uint8Array) {
  let request: typeof CapturePayload.Type;
  try {
    request = decodeCapturePayload(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Error("request body must be a JSON capture object");
  }
  if (request.version !== 1) throw new Error("unsupported payload version");
  if (request.kind !== "page") throw new Error("unsupported payload kind");

  const sourceUrl = validateCaptureUrl(request.url);
  if (Buffer.byteLength(request.defuddledHtml ?? "", "utf8") > MAX_DEFUDDLED_HTML_BYTES) {
    throw new Error("content exceeds the payload size limit");
  }
  checkLength(request.author, 240, "author");
  checkLength(request.publishedDate, 64, "publishedDate");
  const title = request.title?.trim();
  return {
    sourceUrl,
    title: title ? Array.from(title).slice(0, 500).join("") : new URL(sourceUrl).hostname,
  };
}

function originAllowed(origin: string | undefined) {
  const trimmed = origin?.trim();
  if (!trimmed || trimmed === "null") return true;
  if (trimmed === "app://local" || trimmed.startsWith("inkling://")) {
    return true;
  }
  for (const scheme of ["chrome-extension", "moz-extension", "safari-web-extension"]) {
    const prefix = `${scheme}://`;
    if (!trimmed.startsWith(prefix)) continue;
    const host = trimmed.slice(prefix.length);
    if (host && /^[a-z\d._-]+$/iu.test(host)) return true;
  }
  return false;
}

function bearerToken(headers: IncomingHttpHeaders) {
  const value = headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") && value.length > 7
    ? value.slice(7)
    : null;
}

function tokensEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function createRateLimiter(now = Date.now) {
  const requestTimes: number[] = [];
  return () => {
    const current = now();
    while (requestTimes.length && current - requestTimes[0] >= RATE_LIMIT_WINDOW) {
      requestTimes.shift();
    }
    if (requestTimes.length >= RATE_LIMIT_MAX) return false;
    requestTimes.push(current);
    return true;
  };
}

function corsHeaders(origin: string | undefined) {
  const trimmed = origin?.trim();
  const headers: Record<string, string> = { Vary: "Origin" };
  if (trimmed && trimmed !== "null" && originAllowed(trimmed)) {
    headers["Access-Control-Allow-Origin"] = trimmed;
  }
  return headers;
}

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

function readBody(request: IncomingMessage) {
  const declaredLength = request.headers["content-length"];
  const contentLength = declaredLength === undefined ? 0 : Number(declaredLength);
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_JSON_BYTES
  ) {
    return Promise.reject(new Error("body-too-large"));
  }
  return (async () => {
    const chunks: Buffer[] = [];
    let length = 0;
    let tooLarge = false;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > MAX_JSON_BYTES) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    }
    if (tooLarge) throw new Error("body-too-large");
    if (length !== contentLength) throw new Error("bad-request");
    return Buffer.concat(chunks, length);
  })();
}

function tokenLooksValid(value: string) {
  const token = value.trim();
  return token.length >= 32 && token.length <= 128 && /^[a-z\d]+$/iu.test(token);
}

async function persistToken(path: string, token: string) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600).catch(() => {});
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

async function loadOrGenerateToken(path: string) {
  try {
    const stored = await readFile(path, "utf8");
    if (tokenLooksValid(stored)) {
      await chmod(path, 0o600).catch(() => {});
      return stored.trim();
    }
  } catch {}
  const token = randomBytes(32).toString("hex");
  await persistToken(path, token).catch(() => {});
  return token;
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

export async function startCaptureServer({
  libraryDirectory,
  captureUrl,
}: {
  libraryDirectory: string;
  captureUrl: CaptureUrl;
}) {
  const tokenPath = join(libraryDirectory, TOKEN_FILE_NAME);
  let token = await loadOrGenerateToken(tokenPath);
  const allowRequest = createRateLimiter();
  const server = createServer({ maxHeaderSize: MAX_HEAD_BYTES }, (request, response) => {
    request.setTimeout(READ_TIMEOUT, () => {
      if (!response.headersSent) {
        send(response, 400, "Bad Request", {}, { error: "bad-request" });
      }
      request.destroy();
    });
    void handleRequest(request, response, {
      token,
      allowRequest,
      captureUrl,
    });
  });
  server.headersTimeout = READ_TIMEOUT;
  server.requestTimeout = READ_TIMEOUT;
  server.keepAliveTimeout = 1_000;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  return {
    status() {
      const address = server.address();
      if (!server.listening || !address || typeof address === "string") {
        return { running: false, port: null, healthUrl: null };
      }
      return {
        running: true,
        port: address.port,
        healthUrl: `http://127.0.0.1:${address.port}${HEALTH_PATH}`,
      };
    },
    getPairingToken() {
      return token;
    },
    async regeneratePairingToken() {
      const nextToken = randomBytes(32).toString("hex");
      await persistToken(tokenPath, nextToken);
      token = nextToken;
      return token;
    },
    close() {
      if (!server.listening) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export const captureServerInternals = Object.freeze({
  bearerToken,
  corsHeaders,
  createRateLimiter,
  originAllowed,
  tokenLooksValid,
  tokensEqual,
  validateCapturePayload,
  validateCaptureUrl,
});
