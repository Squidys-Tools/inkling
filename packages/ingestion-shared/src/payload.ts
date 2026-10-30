// The capture the browser extension posts to the app's loopback receiver,
// which validates every field again (electron/capture-server.ts). The
// extension sends the page URL and title only; the content fields stay empty.
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
