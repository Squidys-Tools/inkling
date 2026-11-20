import type { File } from "expo-file-system";
import type { Pairing } from "./pairing";

export type CardKind = "Article" | "Image" | "Note" | "Quote" | "PDF" | "Video" | "Post" | "File";

export type PhoneCard = {
  id: string;
  kind: string;
  /** The desktop's card treatment for this item. */
  displayKind: CardKind;
  title: string | null;
  description: string | null;
  sourceUrl: string | null;
  /** The site or app the item came from, as desktop labels it. */
  source: string | null;
  createdAt: number;
  hasThumbnail: boolean;
  /** Changes whenever desktop rewrites the thumbnail, which it does in place. */
  thumbnailVersion: number | null;
  /** The saved page's preview image on the web, for links without a thumbnail of their own. */
  imageUrl: string | null;
  aspectRatio: number | null;
  post: { name: string; handle: string; text: string } | null;
};

/** Desktop was reached and refused the request; a network failure throws something else. */
export class DesktopError extends Error {
  constructor(readonly status: number) {
    super(`desktop answered ${status}`);
  }
}

const REQUEST_TIMEOUT = 15_000;

/** Aborts on the caller's signal or after the timeout; React Native lacks AbortSignal.any and .timeout. */
function deadline(signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) controller.abort();
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    },
  };
}

const endpoint = (pairing: Pairing, path: string) => `${pairing.url.replace(/\/$/u, "")}${path}`;
/** The desktop's tailnet name, such as `studio`, for labels. */
export const desktopName = (pairing: Pairing) =>
  pairing.url.replace(/^https:\/\//u, "").split(/[.:/]/u)[0] ?? pairing.url;
const authorization = (pairing: Pairing) => ({ Authorization: `Bearer ${pairing.token}` });

async function json<T>(pairing: Pairing, path: string, signal?: AbortSignal) {
  const limit = deadline(signal);
  try {
    const response = await fetch(endpoint(pairing, path), {
      headers: authorization(pairing),
      signal: limit.signal,
    });
    if (!response.ok) throw new DesktopError(response.status);
    return (await response.json()) as T;
  } finally {
    limit.done();
  }
}

export const desktopStatus = (pairing: Pairing, signal?: AbortSignal) =>
  json<{ device: string; items: number }>(pairing, "/v1/status", signal);

export type Space = {
  id: string;
  name: string;
  color: "blue" | "orange" | "green" | "pink" | "purple" | "yellow";
  kind: "smart" | "regular";
  itemCount: number | null;
};

/** What the sidebar shows: the whole library, the Archive, or one Space. */
export type Scope = { kind: "everything" } | { kind: "archived" } | { kind: "space"; space: Space };

const scopeQuery = (scope: Scope) =>
  scope.kind === "archived"
    ? "&archived=1"
    : scope.kind === "space"
      ? `&space=${encodeURIComponent(scope.space.id)}`
      : "";

const PAGE_SIZE = 60;

export const cardPage = (
  pairing: Pairing,
  scope: Scope,
  cursor: string | null,
  signal?: AbortSignal,
) =>
  json<{ cards: PhoneCard[]; next: string | null; total: number }>(
    pairing,
    `/v1/cards?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}${scopeQuery(scope)}`,
    signal,
  );

export const listSpaces = (pairing: Pairing, signal?: AbortSignal) =>
  json<{ spaces: Space[] }>(pairing, "/v1/spaces", signal).then((page) => page.spaces);

export const searchCards = (pairing: Pairing, query: string, signal?: AbortSignal) =>
  json<{ cards: PhoneCard[] }>(
    pairing,
    `/v1/search?q=${encodeURIComponent(query)}&limit=200`,
    signal,
  ).then((page) => page.cards);

/** An expo-image source for the desktop's thumbnail; its disk cache is keyed by the version. */
export const thumbnailSource = (pairing: Pairing, card: PhoneCard) => ({
  uri: endpoint(pairing, `/v1/thumbnails/${card.id}?v=${card.thumbnailVersion ?? 0}`),
  headers: authorization(pairing),
  cacheKey: `${pairing.url}|${card.id}|${card.thumbnailVersion ?? 0}`,
});

export type CaptureUpload = {
  id: string;
  kind: "url" | "note" | "image";
  text: string;
  file: File | null;
};

/** Sends one capture; a URL or note goes as its text, an image streams from its file. */
export async function uploadCapture(pairing: Pairing, capture: CaptureUpload) {
  const path = `/v1/captures/${encodeURIComponent(capture.id)}?kind=${capture.kind}${
    capture.kind === "image" && capture.text ? `&name=${encodeURIComponent(capture.text)}` : ""
  }`;
  if (capture.kind === "image") {
    if (!capture.file?.exists) throw new DesktopError(400);
    const result = await capture.file.upload(endpoint(pairing, path), {
      headers: { ...authorization(pairing), "Content-Type": "application/octet-stream" },
    });
    if (result.status !== 200) throw new DesktopError(result.status);
    return;
  }
  const limit = deadline();
  try {
    const response = await fetch(endpoint(pairing, path), {
      method: "POST",
      headers: { ...authorization(pairing), "Content-Type": "text/plain; charset=utf-8" },
      body: capture.text,
      signal: limit.signal,
    });
    if (!response.ok) throw new DesktopError(response.status);
  } finally {
    limit.done();
  }
}
