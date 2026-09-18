import type { DefuddleOptions } from "defuddle";

// Defuddle is pinned to the same version as the root package.json ("0.19.3").
// Bump both together — the extension bundles Defuddle against the live DOM
// while the app runs it against fetched HTML, and version drift between the
// two would silently change what "extracted" means per entry point.

export const DEFUDDLE_VERSION_PIN = "0.19.3" as const;

type InklingDefuddleOptions = Pick<DefuddleOptions, "removeImages" | "standardize" | "useAsync">;

/**
 * Single Defuddle configuration shared by the app and the extension.
 *
 * Mirrors the options in src/lib/ingestion/defuddle-adapter.ts (kept in sync
 * by hand for now — scope rule: Phase 1 adds new directories only, so the app
 * still owns its copy; a follow-up may import this instead). `useAsync` stays
 * off: the extension cannot rely on third-party fetches from a content script,
 * and the app pipeline treats oEmbed-style enrichment as optional anyway.
 */
export const INKLING_DEFUDDLE_OPTIONS: InklingDefuddleOptions = {
  removeImages: false,
  standardize: true,
  useAsync: false,
};
