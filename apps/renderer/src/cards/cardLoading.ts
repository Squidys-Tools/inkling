import type { CardView } from "../library/cardModel.ts";
import type { Processing } from "../library/jobs.ts";

// A new capture queues its jobs together; a tag edit or a re-index much later does not.
const firstCaptureWindow = 10 * 60 * 1000;

export type LoadingPhase = "captured" | "processing" | "failed";

/**
 * Which whole-card state a grid card shows; a card with no thumbnail yet is only captured.
 * The corner badge stays for notes and quotes, which have no thumbnail to wait for, for work
 * queued long after the save, like a re-index, and for a failed picture: it is what was saved,
 * and only finding it is affected.
 */
export function loadingPhase(
  view: Pick<CardView, "treatment" | "image" | "createdAt">,
  processing: Processing | undefined,
): LoadingPhase | null {
  if (!processing || view.treatment === "note" || view.treatment === "quote") return null;
  if (processing.startedAt - view.createdAt > firstCaptureWindow) return null;
  if (processing.active) return view.image ? "processing" : "captured";
  return processing.failedJob && view.treatment !== "media" ? "failed" : null;
}

/** The reveal plays when jobs that were running finish and there is a thumbnail to resolve to. */
export const startsReveal = (
  from: LoadingPhase | null,
  to: LoadingPhase | null,
  image: string | undefined,
) => (from === "captured" || from === "processing") && to === null && image !== undefined;
