import { File, Paths } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";
import type { Pairing } from "./pairing";

export type CardKind = "Article" | "Image" | "Note" | "Quote" | "PDF" | "Video" | "Post" | "File";

export type PhoneCard = {
  id: string;
  kind: string;
  /** The desktop's card treatment for this item; older desktops leave it out. */
  displayKind?: CardKind;
  title: string | null;
  description: string | null;
  sourceUrl: string | null;
  /** The site or app the item came from, as desktop labels it. */
  source?: string | null;
  createdAt: number;
  hasThumbnail: boolean;
  /** The saved page's preview image on the web, for links without a thumbnail of their own. */
  imageUrl?: string | null;
  aspectRatio?: number | null;
  post?: { name: string; handle: string; text: string } | null;
};

/** Desktop was reached and refused the request; a network failure throws something else. */
export class DesktopError extends Error {
  constructor(readonly status: number) {
    super(`desktop answered ${status}`);
  }
}

async function request(pairing: Pairing, method: "GET" | "POST", path: string, body?: unknown) {
  const response = await InklingNative.tailnetRequest(
    pairing.address,
    method,
    path,
    pairing.token,
    body === undefined ? null : JSON.stringify(body),
  );
  if (response.status !== 200) throw new DesktopError(response.status);
  return response;
}

const json = async <T>(pairing: Pairing, path: string) =>
  JSON.parse((await request(pairing, "GET", path)).text) as T;

export const desktopStatus = (pairing: Pairing) =>
  json<{ device: string; items: number }>(pairing, "/v1/status");

export const recentCards = (pairing: Pairing) =>
  json<{ cards: PhoneCard[] }>(pairing, "/v1/cards?limit=200").then((page) => page.cards);

export const searchCards = (pairing: Pairing, query: string) =>
  json<{ cards: PhoneCard[] }>(pairing, `/v1/search?q=${encodeURIComponent(query)}&limit=200`).then(
    (page) => page.cards,
  );

/** Thumbnails are cached on disk by item id; a thumbnail never changes for an item. */
export async function thumbnailUri(pairing: Pairing, id: string) {
  const file = new File(Paths.cache, `thumbnail-${id}.webp`);
  if (!file.exists) {
    const { base64 } = await request(pairing, "GET", `/v1/thumbnails/${id}`);
    file.write(base64, { encoding: "base64" });
  }
  return file.uri;
}

export const uploadCapture = (
  pairing: Pairing,
  capture: { id: string; kind: string; text: string; file?: string },
) => request(pairing, "POST", "/v1/captures", capture);
