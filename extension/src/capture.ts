import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

export function buildUrlCapturePayload(url: string, title: string): PageCapturePayloadV1 {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("only HTTP and HTTPS pages can be saved");
  }
  if (parsedUrl.username || parsedUrl.password) throw new Error("page URL contains credentials");
  // A serialized URL is ASCII, so its length is its byte count.
  const normalizedUrl = parsedUrl.toString();
  if (normalizedUrl.length > 8_192) throw new Error("page URL is too long");
  return {
    version: 1,
    kind: "page",
    url: normalizedUrl,
    title: title.trim().slice(0, 500).trim() || parsedUrl.hostname,
    defuddledHtml: "",
    text: "",
    imageUrls: [],
  };
}
