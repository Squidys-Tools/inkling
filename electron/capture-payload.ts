import { Schema } from "effect";

const MAX_DEFUDDLED_HTML_BYTES = 2 * 1024 * 1024;

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

export function validateCapturePayload(body: Uint8Array) {
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
