import { useActiveJobCount } from "../library/jobs.ts";
import { moodFor } from "./mood.ts";

/**
 * The sidebar mascot's mood: a notification dot while jobs run, attentive with
 * search focused, curious once the user types, sad after a failed capture.
 */
export function useMascotMood(input: {
  searchFocused: boolean;
  query: string;
  captureFailed: boolean;
}) {
  return moodFor({ busy: useActiveJobCount() > 0, ...input });
}
