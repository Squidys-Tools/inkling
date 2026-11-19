import { useEffect, useState } from "react";
import { thumbnailUri, type PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

/** The desktop's thumbnail when it has one, else the saved page's own preview image on the web. */
export function useCardImage(pairing: Pairing, card: PhoneCard) {
  const [thumbnail, setThumbnail] = useState<{
    pairing: Pairing;
    id: string;
    uri: string;
  } | null>(null);
  useEffect(() => {
    if (!card.hasThumbnail) return;
    let live = true;
    thumbnailUri(pairing, card.id).then(
      (uri) => live && setThumbnail({ pairing, id: card.id, uri }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [pairing, card.id, card.hasThumbnail]);
  if (!card.hasThumbnail) return card.imageUrl ?? null;
  // FlashList reuses this hook for other items before the new request settles.
  return thumbnail?.id === card.id &&
    thumbnail.pairing.address === pairing.address &&
    thumbnail.pairing.token === pairing.token
    ? thumbnail.uri
    : null;
}
