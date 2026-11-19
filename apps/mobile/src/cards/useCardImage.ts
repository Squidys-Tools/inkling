import { useEffect, useState } from "react";
import { thumbnailUri, type PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

/** The desktop's thumbnail when it has one, else the saved page's own preview image on the web. */
export function useCardImage(pairing: Pairing, card: PhoneCard) {
  // Keyed by item: the grid recycles card views, so a loaded thumbnail must not outlive its card.
  const [thumbnail, setThumbnail] = useState<{ id: string; uri: string } | null>(null);
  useEffect(() => {
    if (!card.hasThumbnail) return;
    let live = true;
    thumbnailUri(pairing, card.id).then(
      (uri) => live && setThumbnail({ id: card.id, uri }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pairing, card.id, card.hasThumbnail]);
  if (!card.hasThumbnail) return card.imageUrl ?? null;
  return thumbnail?.id === card.id ? thumbnail.uri : null;
}
