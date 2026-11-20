import { thumbnailSource, type PhoneCard } from "../desktop";
import type { Pairing } from "../pairing";

/** The desktop's thumbnail when it has one, else the saved page's own preview image on the web. */
export function cardImage(pairing: Pairing, card: PhoneCard) {
  if (card.hasThumbnail) return thumbnailSource(pairing, card);
  return card.imageUrl ? { uri: card.imageUrl } : null;
}

export type CardImage = ReturnType<typeof cardImage>;
