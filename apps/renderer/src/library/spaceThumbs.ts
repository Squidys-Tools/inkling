import type { LibraryCard, Space } from "@inkling/contracts";
import { useQuery } from "@tanstack/react-query";
import { createAtom, useSelector } from "@tanstack/react-store";
import { libraryQuery } from "../queryClient.ts";
import { assetUrl } from "./assets.ts";

const storageKey = "space-thumbs";
const stripSize = 4;

const isPaths = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");

/** Stored paths are read back as untrusted text; `assetUrl` still decides whether one may load. */
export function parseSpaceThumbs(stored: string | null): Record<string, readonly string[]> {
  try {
    const value: unknown = JSON.parse(stored ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([id, paths]) =>
        isPaths(paths) ? [[id, paths.slice(0, stripSize)]] : [],
      ),
    );
  } catch {
    return {};
  }
}

function readThumbs() {
  try {
    return parseSpaceThumbs(localStorage.getItem(storageKey));
  } catch {
    return {};
  }
}

const thumbs = createAtom(readThumbs());

function store(next: Record<string, readonly string[]>) {
  thumbs.set(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
}

/** The thumbnails of a scope's newest cards. Thumbnails only: an original may be a PDF or huge. */
export const thumbPaths = (cards: readonly Pick<LibraryCard, "thumbnailPath">[], limit: number) =>
  cards.flatMap((card) => card.thumbnailPath ?? []).slice(0, limit);

/** A Smart Space runs its search only when opened, so its pictures keep what it last showed. */
export function rememberSpaceThumbs(spaceId: string, paths: readonly string[]) {
  const kept = paths.slice(0, stripSize);
  if (thumbs.get()[spaceId]?.join("\n") !== kept.join("\n"))
    store({ ...thumbs.get(), [spaceId]: kept });
}

export function forgetSpaceThumbs(spaceId: string) {
  const { [spaceId]: gone, ...rest } = thumbs.get();
  if (gone !== undefined) store(rest);
}

/** Up to four image URLs for a Space's cover and strip, newest first. */
export function useSpaceThumbs(space: Space) {
  const remembered = useSelector(thumbs, (state) => state[space.id]);
  // A Regular Space's membership is stored, so reading its newest cards runs no search.
  const filed = useQuery({
    ...libraryQuery(
      ["spaceThumbs", space.id],
      async (client) =>
        thumbPaths(
          (
            await client.cards({
              scope: { _tag: "Space", spaceId: space.id },
              cursor: null,
              limit: 12,
            })
          ).cards,
          stripSize,
        ),
      (change) => change._tag === "SpacesChanged" || change._tag === "ItemsRemoved",
    ),
    enabled: space.kind === "regular",
  }).data;
  return (filed ?? remembered ?? []).flatMap((path) => assetUrl(path) ?? []);
}
