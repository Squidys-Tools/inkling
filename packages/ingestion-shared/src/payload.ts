// Versioned capture payload shared by the browser extension (producer) and the
// inkling app (consumer).
//
// Trust contract: extraction runs in the extension against the live DOM, so
// `defuddledHtml` is untrusted page content. The app MUST re-sanitize it with
// its own pipeline (src/lib/ingestion/html-safety.ts `sanitizeHtml`) on receipt
// before storing or rendering — the same rule that applies to fetched HTML in
// docs/tech-stack.md ("treat all fetched HTML as untrusted"). The extension
// never sanitizes on behalf of the app; sanitizers drift, the app's copy wins.

export const INGESTION_PAYLOAD_VERSION = 1 as const;

export type IngestionPayloadKind = "page";

export interface PageCapturePayloadV1 {
  version: 1;
  kind: "page";
  url: string;
  title: string;
  defuddledHtml: string;
  text: string;
  author?: string;
  publishedDate?: string | null;
  imageUrls: string[];
  /** Absolute http(s) favicon for the seal badge; omitted when unknown. */
  favicon?: string;
}

/** Upper bound so a single capture cannot exhaust chrome.storage.local quota. */
export const MAX_DEFUDDLED_HTML_BYTES = 2 * 1024 * 1024;

export class PayloadValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`invalid capture payload (${field}): ${message}`);
    this.name = "PayloadValidationError";
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpUrl(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new PayloadValidationError(field, "expected a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PayloadValidationError(field, "expected an absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PayloadValidationError(field, "expected an http(s) URL");
  }
  return parsed.toString();
}

function cleanImageUrls(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PayloadValidationError("imageUrls", "expected an array of URLs");
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || !entry) continue;
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const normalized = parsed.toString();
    if (!seen.has(normalized)) seen.add(normalized);
    if (seen.size >= 200) break;
  }
  return [...seen];
}

/** Validate an unknown value as a v1 page-capture payload. Throws on mismatch. */
export function parsePageCapturePayload(value: unknown): PageCapturePayloadV1 {
  if (!isRecord(value)) {
    throw new PayloadValidationError("payload", "expected an object");
  }
  if (value.version !== INGESTION_PAYLOAD_VERSION) {
    throw new PayloadValidationError("version", `expected version ${INGESTION_PAYLOAD_VERSION}`);
  }
  if (value.kind !== "page") {
    throw new PayloadValidationError("kind", "expected kind 'page'");
  }
  const url = httpUrl(value.url, "url");
  if (typeof value.title !== "string" || !value.title.trim()) {
    throw new PayloadValidationError("title", "expected a non-empty string");
  }
  if (typeof value.defuddledHtml !== "string") {
    throw new PayloadValidationError("defuddledHtml", "expected a string");
  }
  if (new TextEncoder().encode(value.defuddledHtml).byteLength > MAX_DEFUDDLED_HTML_BYTES) {
    throw new PayloadValidationError("defuddledHtml", "content exceeds the payload size limit");
  }
  if (typeof value.text !== "string") {
    throw new PayloadValidationError("text", "expected a string");
  }
  if (value.author !== undefined && typeof value.author !== "string") {
    throw new PayloadValidationError("author", "expected a string when present");
  }
  if (
    value.publishedDate !== undefined &&
    value.publishedDate !== null &&
    typeof value.publishedDate !== "string"
  ) {
    throw new PayloadValidationError("publishedDate", "expected a string or null when present");
  }

  const payload: PageCapturePayloadV1 = {
    version: 1,
    kind: "page",
    url,
    title: value.title,
    defuddledHtml: value.defuddledHtml,
    text: value.text,
    imageUrls: cleanImageUrls(value.imageUrls),
  };
  if (value.author !== undefined) payload.author = value.author;
  if (value.publishedDate !== undefined) payload.publishedDate = value.publishedDate;
  if (value.favicon !== undefined && value.favicon !== null && value.favicon !== "") {
    try {
      payload.favicon = httpUrl(value.favicon, "favicon");
    } catch {
      // Forgiving like image URLs: a bad favicon never fails the capture.
    }
  }
  return payload;
}

export function isPageCapturePayload(value: unknown): value is PageCapturePayloadV1 {
  try {
    parsePageCapturePayload(value);
    return true;
  } catch {
    return false;
  }
}

export interface BuildPagePayloadInput {
  url: string;
  title: string;
  defuddledHtml: string;
  text: string;
  author?: string;
  publishedDate?: string | null;
  imageUrls?: string[];
  favicon?: string;
}

/**
 * Build a v1 page payload. Forgiving by design — capture stays instant, so a
 * blank title falls back to the hostname (mirroring the app's own ingestUrl)
 * and partial content is kept for the app-side fallback path.
 */
export function buildPageCapturePayload(input: BuildPagePayloadInput): PageCapturePayloadV1 {
  const url = httpUrl(input.url, "url");
  const title = input.title.trim() || new URL(url).hostname;
  return parsePageCapturePayload({
    version: INGESTION_PAYLOAD_VERSION,
    kind: "page",
    url,
    title,
    defuddledHtml: input.defuddledHtml,
    text: input.text,
    ...(input.author !== undefined ? { author: input.author } : {}),
    ...(input.publishedDate !== undefined ? { publishedDate: input.publishedDate } : {}),
    imageUrls: input.imageUrls ?? [],
    ...(input.favicon !== undefined ? { favicon: input.favicon } : {}),
  });
}
