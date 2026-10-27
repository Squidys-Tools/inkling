import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, join } from "node:path";

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_HEAD_BYTES = 64 * 1024;
const MAX_DEFUDDLED_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_URLS = 200;
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW = 60_000;
const READ_TIMEOUT = 10_000;
const HEALTH_PATH = "/v1/health";
const CAPTURES_PATH = "/v1/captures";
const TOKEN_FILE_NAME = "pairing_token";
const DROP_TAGS = new Set(["link", "meta", "base"]);
const SKIP_CONTENT_TAGS = new Set([
  "script",
  "style",
  "template",
  "object",
  "applet",
  "embed",
  "form",
  "frame",
  "frameset",
  "noembed",
  "noframes",
]);
const URL_ATTRS = new Set([
  "href",
  "src",
  "poster",
  "cite",
  "action",
  "formaction",
  "data",
  "background",
  "xlink:href",
]);
const SAFE_IFRAME_HOSTS = new Set([
  "loom.com",
  "open.spotify.com",
  "player.twitch.tv",
  "player.vimeo.com",
  "soundcloud.com",
  "w.soundcloud.com",
  "vimeo.com",
  "www.loom.com",
  "www.youtube-nocookie.com",
  "www.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "youtube.com",
]);

function isAsciiWhitespace(character: string) {
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function truncateChars(value: string, max: number) {
  let count = 0;
  let truncated = "";
  for (const character of value) {
    if (count === max) return truncated;
    truncated += character;
    count += 1;
  }
  return value;
}

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

function cappedString(value: string | null | undefined, max: number, field: string) {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (Buffer.byteLength(trimmed, "utf8") > max) {
    throw new Error(`${field} must be at most ${max} characters`);
  }
  return trimmed;
}

function cleanImageUrls(values: string[]) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const entry of values) {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) continue;
    cleaned.push(parsed.toString());
    if (cleaned.length >= MAX_IMAGE_URLS) break;
  }
  return cleaned;
}

function hasStringField(request: Record<string, unknown>, key: string, optional = false) {
  if (!Object.hasOwn(request, key)) return optional;
  return typeof request[key] === "string";
}

type CapturePayload = {
  version: number;
  kind: string;
  url: string;
  title?: string;
  defuddledHtml?: string;
  text?: string;
  author?: string | null;
  publishedDate?: string | null;
  imageUrls?: string[];
};

function validateCapturePayload(body: Uint8Array) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Error("request body must be a JSON capture object");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("request body must be a JSON capture object");
  }
  const fields = parsed as Record<string, unknown>;
  if (
    typeof fields.version !== "number" ||
    !Number.isInteger(fields.version) ||
    fields.version < 0 ||
    fields.version > 255 ||
    !hasStringField(fields, "kind") ||
    !hasStringField(fields, "url") ||
    !hasStringField(fields, "title", true) ||
    !hasStringField(fields, "defuddledHtml", true) ||
    !hasStringField(fields, "text", true) ||
    (!hasStringField(fields, "author", true) && fields.author !== null) ||
    (!hasStringField(fields, "publishedDate", true) && fields.publishedDate !== null) ||
    (Object.hasOwn(fields, "imageUrls") &&
      (!Array.isArray(fields.imageUrls) ||
        !fields.imageUrls.every((value) => typeof value === "string")))
  ) {
    throw new Error("request body must be a JSON capture object");
  }
  const request = fields as CapturePayload;
  if (request.version !== 1) throw new Error("unsupported payload version");
  if (request.kind !== "page") throw new Error("unsupported payload kind");

  const sourceUrl = validateCaptureUrl(request.url);
  const defuddledHtml = request.defuddledHtml ?? "";
  if (Buffer.byteLength(defuddledHtml, "utf8") > MAX_DEFUDDLED_HTML_BYTES) {
    throw new Error("content exceeds the payload size limit");
  }
  const parsedUrl = new URL(sourceUrl);
  const hostname = parsedUrl.hostname;
  const rawTitle = request.title ?? "";
  const title = rawTitle.trim() ? truncateChars(rawTitle.trim(), 500) : hostname;
  const author = cappedString(request.author, 240, "author");
  const publishedDate = cappedString(request.publishedDate, 64, "publishedDate");
  const text = truncateChars((request.text ?? "").trim(), 200_000);
  const imageUrls = cleanImageUrls(request.imageUrls ?? []);
  const metadata: Record<string, unknown> = {
    sourceUrl,
    text,
    html: scrubExtensionHtml(defuddledHtml, sourceUrl),
    imageUrls,
    safeEmbeds: [],
    origin: "browser-extension",
    payloadVersion: 1,
  };
  if (author) metadata.author = author;
  if (publishedDate) metadata.publishedDate = publishedDate;

  return {
    sourceUrl,
    title: title || undefined,
    description: null,
    body: text,
    metadata,
  };
}

function findInsensitive(haystack: string, needle: string, from: number) {
  if (!needle || from >= haystack.length) return -1;
  const foldedNeedle = needle.toLowerCase();
  for (let index = from; index <= haystack.length - needle.length; index += 1) {
    if (haystack.slice(index, index + needle.length).toLowerCase() === foldedNeedle) return index;
  }
  return -1;
}

function tagName(tag: string) {
  let inner = tag.startsWith("<") ? tag.slice(1) : tag;
  if (inner.startsWith("/")) inner = inner.slice(1);
  const end = inner.search(/[\s/>]/u);
  return end === -1 ? inner : inner.slice(0, end);
}

function tagEnd(html: string, from: number) {
  let quote: string | null = null;
  for (let index = from; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return null;
}

function attributeValue(tag: string, wanted: string) {
  let index = 0;
  while (index < tag.length) {
    while (
      index < tag.length &&
      (isAsciiWhitespace(tag[index]) || tag[index] === "<" || tag[index] === "/")
    ) {
      index += 1;
    }
    const nameStart = index;
    while (
      index < tag.length &&
      !isAsciiWhitespace(tag[index]) &&
      tag[index] !== "=" &&
      tag[index] !== "/" &&
      tag[index] !== ">"
    ) {
      index += 1;
    }
    if (nameStart === index) {
      index += 1;
      continue;
    }
    const name = tag.slice(nameStart, index).toLowerCase();
    while (index < tag.length && isAsciiWhitespace(tag[index])) index += 1;
    if (index < tag.length && tag[index] === "=") {
      index += 1;
      while (index < tag.length && isAsciiWhitespace(tag[index])) index += 1;
      let value: string;
      if (index < tag.length && (tag[index] === '"' || tag[index] === "'")) {
        const quote = tag[index];
        index += 1;
        const start = index;
        while (index < tag.length && tag[index] !== quote) index += 1;
        value = tag.slice(start, index);
        index += 1;
      } else {
        const start = index;
        while (index < tag.length && !isAsciiWhitespace(tag[index]) && tag[index] !== ">") {
          index += 1;
        }
        value = tag.slice(start, index);
      }
      if (name === wanted) return value;
    } else if (name === wanted) {
      return "";
    }
  }
  return null;
}

function iframeHostAllowed(source: string | null) {
  const trimmed = source?.trim();
  if (!trimmed) return false;
  const scheme = trimmed.indexOf("://");
  if (scheme === -1) return false;
  let host = trimmed.slice(scheme + 3).split(/[/?#]/u, 1)[0];
  host = (host.split("@").at(-1) ?? "").split(":", 1)[0];
  return SAFE_IFRAME_HOSTS.has(host.toLowerCase());
}

function safeUrlAttribute(value: string) {
  const trimmed = value.replace(/^[\s\p{Cc}]+/u, "");
  if (!trimmed || trimmed.startsWith("#")) return false;
  const colon = trimmed.indexOf(":");
  if (colon === -1 || trimmed.slice(0, colon).includes("/")) return true;
  const scheme = trimmed.slice(0, colon).trim().toLowerCase();
  return scheme === "http" || scheme === "https";
}

function scrubTag(tag: string) {
  let output = "<";
  let index = 1;
  while (
    index < tag.length &&
    !isAsciiWhitespace(tag[index]) &&
    tag[index] !== "/" &&
    tag[index] !== ">"
  ) {
    output += tag[index];
    index += 1;
  }
  const isIframe = tagName(tag).toLowerCase() === "iframe";
  while (true) {
    while (index < tag.length && isAsciiWhitespace(tag[index])) {
      if (!output.endsWith(" ") && !output.endsWith("<")) output += " ";
      index += 1;
    }
    if (index >= tag.length || tag[index] === ">") {
      output = `${output.replace(/ +$/u, "")}>`;
      break;
    }
    if (tag[index] === "/") {
      output += "/";
      index += 1;
      continue;
    }
    const nameStart = index;
    while (
      index < tag.length &&
      !isAsciiWhitespace(tag[index]) &&
      tag[index] !== "=" &&
      tag[index] !== "/" &&
      tag[index] !== ">"
    ) {
      index += 1;
    }
    const name = tag.slice(nameStart, index).toLowerCase();
    while (index < tag.length && isAsciiWhitespace(tag[index])) index += 1;
    let value: string | undefined;
    if (index < tag.length && tag[index] === "=") {
      index += 1;
      while (index < tag.length && isAsciiWhitespace(tag[index])) index += 1;
      if (index < tag.length && (tag[index] === '"' || tag[index] === "'")) {
        const quote = tag[index];
        index += 1;
        const valueStart = index;
        while (index < tag.length && tag[index] !== quote) index += 1;
        value = tag.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;
        while (
          index < tag.length &&
          !isAsciiWhitespace(tag[index]) &&
          tag[index] !== ">" &&
          !(tag[index] === "/" && tag[index + 1] === ">")
        ) {
          index += 1;
        }
        value = tag.slice(valueStart, index);
      }
    }
    if (
      (name.startsWith("on") && name.length > 2) ||
      name === "style" ||
      name === "srcdoc" ||
      name === "srcset" ||
      (isIframe && (name === "allow" || name === "allowfullscreen"))
    ) {
      continue;
    }
    if (URL_ATTRS.has(name) && (value === undefined || !safeUrlAttribute(value))) continue;
    output += ` ${name}`;
    if (value !== undefined) output += `="${value.replaceAll('"', "&quot;")}"`;
  }
  return output;
}

function scrubExtensionHtml(html: string, _pageUrl: string) {
  let output = "";
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const commentEnd = findInsensitive(html, "-->", index + 4);
      if (commentEnd === -1) break;
      index = commentEnd + 3;
      continue;
    }
    const tagStart = html.indexOf("<", index);
    if (tagStart === -1) {
      output += html.slice(index);
      break;
    }
    output += html.slice(index, tagStart);
    index = tagStart;
    if (html.startsWith("</", index)) {
      const end = tagEnd(html, index);
      if (end === null) break;
      if (tagName(html.slice(index, end)).toLowerCase() !== "noscript") {
        output += html.slice(index, end);
      }
      index = end;
      continue;
    }
    const end = tagEnd(html, index);
    if (end === null) break;
    const tag = html.slice(index, end);
    const name = tagName(tag).toLowerCase();
    if (!name || name.startsWith("!")) {
      index = end;
      continue;
    }
    if (DROP_TAGS.has(name) || name === "noscript") {
      index = end;
      continue;
    }
    if (SKIP_CONTENT_TAGS.has(name)) {
      const closeAt = findInsensitive(html, `</${name}`, end);
      index = closeAt === -1 ? end : (tagEnd(html, closeAt) ?? html.length);
      continue;
    }
    if (name === "iframe" && !iframeHostAllowed(attributeValue(tag, "src"))) {
      const closeAt = findInsensitive(html, "</iframe", end);
      index = closeAt === -1 ? end : (tagEnd(html, closeAt) ?? html.length);
      continue;
    }
    output += scrubTag(tag);
    index = end;
  }
  return output;
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

function writeResponse(
  response: ServerResponse,
  status: number,
  statusText: string,
  extra: Record<string, string>,
  body: string,
) {
  const bodyBytes = Buffer.from(body, "utf8");
  response.writeHead(status, statusText, {
    "Content-Type": "application/json",
    "Content-Length": bodyBytes.length,
    Connection: "close",
    ...extra,
  });
  response.end(bodyBytes);
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

function sendJson(
  response: ServerResponse,
  status: number,
  statusText: string,
  headers: Record<string, string>,
  value: unknown,
) {
  writeResponse(response, status, statusText, headers, JSON.stringify(value));
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
    writeResponse(
      response,
      204,
      "No Content",
      {
        ...cors,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
      },
      "",
    );
    return;
  }
  if (!originAllowed(origin)) {
    sendJson(response, 403, "Forbidden", cors, { error: "origin-not-allowed" });
    return;
  }
  const presentedToken = bearerToken(request.headers);
  if (!presentedToken || !tokensEqual(presentedToken, token)) {
    sendJson(response, 401, "Unauthorized", cors, { error: "unauthorized" });
    return;
  }
  if (!allowRequest()) {
    sendJson(
      response,
      429,
      "Too Many Requests",
      { ...cors, "Retry-After": "60" },
      {
        error: "rate-limited",
      },
    );
    return;
  }
  const path = requestPath(request.url ?? "/");
  if (request.method === "GET" && path === HEALTH_PATH) {
    sendJson(response, 200, "OK", cors, { status: "ok" });
    return;
  }
  if (request.method !== "POST" || path !== CAPTURES_PATH) {
    sendJson(response, 404, "Not Found", cors, { error: "not-found" });
    return;
  }
  const contentType = request.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    sendJson(response, 415, "Unsupported Media Type", cors, { error: "json-only" });
    return;
  }
  let body: Buffer;
  try {
    body = await readBody(request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bad-request";
    const tooLarge = reason === "body-too-large";
    sendJson(response, tooLarge ? 413 : 400, tooLarge ? "Payload Too Large" : "Bad Request", cors, {
      error: tooLarge ? "body-too-large" : "bad-request",
    });
    return;
  }
  let input: ReturnType<typeof validateCapturePayload>;
  try {
    input = validateCapturePayload(body);
  } catch (error) {
    sendJson(response, 422, "Unprocessable Entity", cors, {
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
    sendJson(response, 201, "Created", cors, { id: item.id });
  } catch {
    sendJson(response, 503, "Unavailable", cors, { error: "storage-unavailable" });
  }
}

export async function startCaptureServer({
  libraryDirectory,
  captureUrl,
}: {
  libraryDirectory: string;
  captureUrl: CaptureUrl;
}) {
  if (!libraryDirectory || typeof captureUrl !== "function") {
    throw new TypeError(
      "capture server requires a library directory and storage captureUrl function",
    );
  }
  const tokenPath = join(libraryDirectory, TOKEN_FILE_NAME);
  let token = await loadOrGenerateToken(tokenPath);
  const allowRequest = createRateLimiter();
  const server = createServer({ maxHeaderSize: MAX_HEAD_BYTES }, (request, response) => {
    request.setTimeout(READ_TIMEOUT, () => {
      if (!response.headersSent) {
        sendJson(response, 400, "Bad Request", {}, { error: "bad-request" });
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
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

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
  cleanImageUrls,
  corsHeaders,
  createRateLimiter,
  originAllowed,
  scrubExtensionHtml,
  tokenLooksValid,
  tokensEqual,
  validateCapturePayload,
  validateCaptureUrl,
});
