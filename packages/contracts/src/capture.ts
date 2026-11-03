// What the browser extension posts to the app's loopback receiver, which
// validates every field again (apps/desktop/src/capture/payload.ts). A page
// capture sends the URL and title only; its content fields stay empty.
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
}

/** Text the user selected on the page at `url`, saved as a quote. */
export interface QuoteCapturePayloadV1 {
  version: 1;
  kind: "quote";
  url: string;
  selection: string;
  attribution: string;
}

/** An image on the page at `url`; the app downloads it and keeps the page if it cannot. */
export interface ImageCapturePayloadV1 {
  version: 1;
  kind: "image";
  url: string;
  imageUrl: string;
  alt: string;
}

export type CapturePayloadV1 = PageCapturePayloadV1 | QuoteCapturePayloadV1 | ImageCapturePayloadV1;

// Both receivers cut a capture with these, and the extension shows the same cut before it
// sends. The library rejects a quote or attribution longer than its limit in UTF-16 units.
export const cutCapture = {
  title: (value: string) => Array.from(value).slice(0, 500).join(""),
  quote: (value: string) => value.slice(0, 1500),
  attribution: (value: string) => value.slice(0, 240),
};
