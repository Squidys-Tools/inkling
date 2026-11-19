import { useEffect, useState } from "react";
import { thumbnailUri, type PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

/** The desktop's thumbnail when it has one, else the saved page's own preview image on the web. */
export function useCardImage(pairing: Pairing, card: PhoneCard) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    if (!card.hasThumbnail) return;
    let live = true;
    thumbnailUri(pairing, card.id).then(
      (uri) => live && setThumbnail(uri),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pairing, card.id, card.hasThumbnail]);
  return card.hasThumbnail ? thumbnail : (card.imageUrl ?? null);
}
