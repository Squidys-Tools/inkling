import type { CapturePayloadV1 } from "@inkling/contracts/capture";
import type { LibraryCard } from "@inkling/contracts";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { webUrl } from "../../apps/renderer/src/library/assets.ts";
import {
  buildImageCapturePayload,
  buildQuoteCapturePayload,
  buildUrlCapturePayload,
} from "./capture";

/**
 * Runs inside the page through `scripting.executeScript`, so it must stand
 * alone: no imports, no closure. It reads what the page says about itself and
 * the current selection, nothing else.
 */
export function readPage() {
  const meta = (...names: string[]) => {
    for (const name of names) {
      const content = document
        .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
        ?.getAttribute("content")
        ?.trim();
      if (content) return content;
    }
    return "";
  };
  const shownImage = document.contentType.startsWith("image/") ? document.images[0] : undefined;
  let image = "";
  try {
    const declared = meta("og:image", "og:image:url", "twitter:image", "twitter:image:src");
    image = declared ? new URL(declared, document.baseURI).href : "";
  } catch {
    image = "";
  }
  return {
    contentType: document.contentType,
    selection: window.getSelection()?.toString() ?? "",
    description: meta("og:description", "twitter:description", "description"),
    image,
    width: shownImage?.naturalWidth ?? 0,
    height: shownImage?.naturalHeight ?? 0,
  };
}

export type PageFacts = ReturnType<typeof readPage>;

/** One way to save the page: what goes to the app, and the card it will make. */
export type Choice = {
  id: "page" | "quote" | "image";
  /** What the card is, in the words of the popup's heading. */
  noun: string;
  /** The text field the user may change before saving, if this kind has one. */
  field?: { label: string; value: string };
  build: (field: string) => { payload: CapturePayloadV1; card: LibraryCard };
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";

const card = (fields: Partial<LibraryCard> & Pick<LibraryCard, "kind" | "title">): LibraryCard => {
  const now = Date.now();
  return {
    id: "preview",
    description: null,
    sourceUrl: null,
    sourceLabel: null,
    localAssetPath: null,
    thumbnailPath: null,
    ocrText: "",
    createdAt: now,
    updatedAt: now,
    archived: false,
    hasArticleContent: false,
    metadata: {},
    ...fields,
  };
};

// X titles a post's page `Name on X: "text" / X`; the app fetches the real post after saving.
const xPostTitle = /^(.+?) on X: "([\s\S]+)" \/ X$/u;
const xPostPath = /^\/([^/]+)\/status\/(\d{1,30})(?:\/|$)/u;

function xPost(url: URL, title: string) {
  if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(url.hostname.replace(/^www\./u, "")))
    return undefined;
  const path = xPostPath.exec(url.pathname);
  const words = xPostTitle.exec(title);
  if (!path || !words) return undefined;
  return {
    provider: "x",
    postUrl: url.toString(),
    postId: path[2],
    authorName: words[1],
    authorHandle: path[1] === "i" ? undefined : path[1],
    text: words[2],
  };
}

function pageNoun(url: URL, contentType: string, social: unknown) {
  if (social) return "post";
  if (videoLinkFromSourceUrl(url.toString())) return "video";
  if (contentType === "application/pdf" || url.pathname.toLowerCase().endsWith(".pdf"))
    return "PDF";
  return "page";
}

/**
 * The ways to save the open tab, the first being the one the popup picks. Null
 * when the tab is not a web page. `facts` is null when the page could not be
 * read, as on the Chrome Web Store, and the popup falls back to the tab alone.
 */
export function pageChoices(
  tab: { url?: string; title?: string },
  facts: Partial<PageFacts> | null,
): Choice[] | null {
  let url: URL;
  try {
    url = new URL(buildUrlCapturePayload(tab.url ?? "", "").url);
  } catch {
    return null;
  }
  const pageTitle = text(tab.title, 500);
  const contentType = text(facts?.contentType, 100).toLowerCase();
  const hostname = url.hostname;

  if (contentType.startsWith("image/")) {
    const name = url.pathname.split("/").filter(Boolean).pop() || "image";
    const width = Number(facts?.width) || 0;
    const height = Number(facts?.height) || 0;
    return [
      {
        id: "image",
        noun: "image",
        build: () => ({
          payload: buildImageCapturePayload(url.toString(), url.toString(), ""),
          card: card({
            kind: "image",
            // The app names a downloaded image after its last path segment.
            title: name.slice(0, 80),
            sourceUrl: url.toString(),
            sourceLabel: hostname,
            metadata:
              width && height
                ? { imageUrls: [url.toString()], mediaWidth: width, mediaHeight: height }
                : { imageUrls: [url.toString()] },
          }),
        }),
      },
    ];
  }

  const social = xPost(url, pageTitle);
  const image = typeof facts?.image === "string" ? webUrl(facts.image) : undefined;
  const description = text(facts?.description, 300);
  const page: Choice = {
    id: "page",
    noun: pageNoun(url, contentType, social),
    field: { label: "Title", value: pageTitle },
    build: (title) => {
      const payload = buildUrlCapturePayload(url.toString(), title);
      return {
        payload,
        card: card({
          kind: "url",
          title: payload.title || hostname,
          description: description || null,
          sourceUrl: payload.url,
          sourceLabel: hostname,
          metadata: { imageUrls: image ? [image] : [], ...(social && { social }) },
        }),
      };
    },
  };

  const selection = typeof facts?.selection === "string" ? facts.selection.trim() : "";
  if (!selection) return [page];
  const quote: Choice = {
    id: "quote",
    noun: "quote",
    field: { label: "Source", value: pageTitle },
    build: (attribution) => {
      const payload = buildQuoteCapturePayload(url.toString(), selection, attribution);
      return {
        payload,
        card: card({
          kind: "quote",
          title: payload.selection,
          description: payload.attribution,
          sourceUrl: payload.url,
          sourceLabel: hostname,
        }),
      };
    },
  };
  return [quote, page];
}
