import type { LibraryCard } from "@inkling/contracts";
import { reconcileItems, reevaluateShownSpace } from "./cards.ts";
import { search } from "./search.ts";

/**
 * Shows a card this window just wrote, before the library's change event
 * lands, and asks the shown Smart Space again: a user's own edit may move an
 * item in or out of it, where a background job's does not re-run it.
 */
export function showWrittenCard(card: LibraryCard) {
  search.remove(reconcileItems([card.id], [card]));
  reevaluateShownSpace();
}
