import { toCardView } from "../../../renderer/src/library/cardModel.ts";
import { type Entry, matchesSearch } from "../../../renderer/src/library/preview/client.ts";
import { seedBodies, seedCards } from "../../../renderer/src/library/preview/seed.ts";

// The web preview's demo library, searched the way the preview searches it.
const entries: Entry[] = seedCards.map((card) => ({ card, body: seedBodies[card.id] ?? "" }));
const views = new Map(seedCards.map((card) => [card.id, toCardView(card)]));
export const demoViews = [...views.values()];

export function searchDemo(query: string) {
  const found = query.trim() ? entries.filter((entry) => matchesSearch(entry, query)) : entries;
  return found.flatMap(({ card }) => views.get(card.id) ?? []);
}
