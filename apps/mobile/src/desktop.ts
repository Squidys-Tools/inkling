import { File, Paths } from "expo-file-system";
import InklingNative from "../modules/inkling-native/src/InklingNativeModule";
import type { Pairing } from "./pairing";

export type PhoneCard = {
  id: string;
  kind: string;
  title: string | null;
  description: string | null;
  sourceUrl: string | null;
  createdAt: number;
  hasThumbnail: boolean;
};

async function request(pairing: Pairing, method: "GET" | "POST", path: string, body?: unknown) {
  const response = await InklingNative.tailnetRequest(
    pairing.address,
    method,
    path,
    pairing.token,
    body === undefined ? null : JSON.stringify(body),
  );
  if (response.status !== 200) throw new Error(`desktop answered ${response.status}`);
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
