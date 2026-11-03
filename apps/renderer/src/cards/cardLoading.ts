import type { CardView } from "../library/cardModel.ts";
import type { Processing } from "../library/jobs.ts";

export type LoadingPhase = "captured" | "processing" | "failed";

/**
 * Which whole-card state a grid card shows. Notes and quotes are drawn from
 * their own text, so they have no thumbnail to wait for and keep the corner badge.
 * A card with no thumbnail yet is only captured; once it has one, running jobs are processing.
 */
export function loadingPhase(
  view: Pick<CardView, "treatment" | "image">,
  processing: Processing | undefined,
): LoadingPhase | null {
  if (!processing || view.treatment === "note" || view.treatment === "quote") return null;
  if (processing.active) return view.image ? "processing" : "captured";
  return processing.failedJob ? "failed" : null;
}

/** The reveal plays when jobs that were running finish and there is a thumbnail to resolve to. */
export const startsReveal = (
  from: LoadingPhase | null,
  to: LoadingPhase | null,
  image: string | undefined,
) => (from === "captured" || from === "processing") && to === null && image !== undefined;
