import { buildPageCapturePayload } from "@inkling/ingestion-shared";

export function buildUrlCapturePayload(url: string, title: string) {
  const parsedUrl = new URL(url);
  if (parsedUrl.username || parsedUrl.password) throw new Error("page URL contains credentials");
  const normalizedUrl = parsedUrl.toString();
  if (new TextEncoder().encode(normalizedUrl).byteLength > 8_192) {
    throw new Error("page URL is too long");
  }
  return buildPageCapturePayload({
    url: normalizedUrl,
    title: title.trim().slice(0, 500),
    defuddledHtml: "",
    text: "",
    imageUrls: [],
  });
}
