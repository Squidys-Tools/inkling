import {
  cutCapture,
  type ImageCapturePayloadV1,
  type PageCapturePayloadV1,
  type QuoteCapturePayloadV1,
} from "@inkling/contracts/capture";

function webUrl(url: string) {
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("only HTTP and HTTPS pages can be saved");
  }
  if (parsedUrl.username || parsedUrl.password) throw new Error("page URL contains credentials");
  // A serialized URL is ASCII, so its length is its byte count.
  const normalizedUrl = parsedUrl.toString();
  if (normalizedUrl.length > 8_192) throw new Error("page URL is too long");
  return parsedUrl;
}

export function buildUrlCapturePayload(url: string, title: string): PageCapturePayloadV1 {
  const parsedUrl = webUrl(url);
  return {
    version: 1,
    kind: "page",
    url: parsedUrl.toString(),
    // Left blank, the app takes the page's own title once it fetches the page.
    title: cutCapture.title(title.trim()).trim(),
    defuddledHtml: "",
    text: "",
    imageUrls: [],
  };
}

export function buildQuoteCapturePayload(
  url: string,
  selection: string,
  attribution: string,
): QuoteCapturePayloadV1 {
  const parsedUrl = webUrl(url);
  const text = cutCapture.quote(selection.trim()).trim();
  if (!text) throw new Error("select some text to save it as a quote");
  return {
    version: 1,
    kind: "quote",
    url: parsedUrl.toString(),
    selection: text,
    attribution:
      cutCapture.attribution(attribution.trim()).trim() ||
      parsedUrl.hostname.replace(/^www\./u, ""),
  };
}

export function buildImageCapturePayload(
  pageUrl: string,
  imageUrl: string,
  alt: string,
): ImageCapturePayloadV1 {
  let image: URL;
  try {
    image = webUrl(imageUrl);
  } catch {
    throw new Error("only images with a web address can be saved");
  }
  return {
    version: 1,
    kind: "image",
    url: webUrl(pageUrl).toString(),
    imageUrl: image.toString(),
    alt: cutCapture.attribution(alt.trim()),
  };
}
