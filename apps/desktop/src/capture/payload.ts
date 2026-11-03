import { cutCapture } from "@inkling/contracts/capture";
import { Schema } from "effect";
import type { DeepLinkCapture } from "./deep-link.ts";
import { publicWebUrl } from "./web-url.ts";

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
    selection: Schema.optionalKey(Schema.String),
    attribution: Schema.optionalKey(Schema.String),
    imageUrl: Schema.optionalKey(Schema.String),
    alt: Schema.optionalKey(Schema.String),
  }),
);
const decodeCapturePayload = Schema.decodeUnknownSync(CapturePayload);

/** Reads a receiver request into the same capture an `inkling://` link makes. */
export function validateCapturePayload(body: Uint8Array): DeepLinkCapture {
  let request: typeof CapturePayload.Type;
  try {
    request = decodeCapturePayload(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    throw new Error("request body must be a JSON capture object");
  }
  if (request.version !== 1) throw new Error("unsupported payload version");

  const url = validateCaptureUrl(request.url);
  const hostname = new URL(url).hostname;
  if (request.kind === "quote") {
    const selection = request.selection?.trim();
    if (!selection) throw new Error("a quote needs selected text");
    return {
      kind: "quote",
      url,
      selection: cutCapture.quote(selection),
      attribution: cutCapture.attribution(
        request.attribution?.trim() || hostname.replace(/^www\./u, ""),
      ),
    };
  }
  if (request.kind === "image") {
    // The app downloads this address, so it must name a public host like an image link does.
    const imageUrl = publicWebUrl(request.imageUrl ?? "");
    if (!imageUrl) throw new Error("imageUrl must be a public http(s) URL");
    return {
      kind: "image",
      pageUrl: url,
      imageUrl,
      alt: cutCapture.attribution(request.alt?.trim() ?? ""),
    };
  }
  if (request.kind !== "page") throw new Error("unsupported payload kind");

  if (Buffer.byteLength(request.defuddledHtml ?? "", "utf8") > MAX_DEFUDDLED_HTML_BYTES) {
    throw new Error("content exceeds the payload size limit");
  }
  checkLength(request.author, 240, "author");
  checkLength(request.publishedDate, 64, "publishedDate");
  // A blank title stays out, so the library takes the page's own once it fetches it.
  const title = cutCapture.title(request.title?.trim() ?? "");
  return title ? { kind: "url", url, title } : { kind: "url", url };
}
