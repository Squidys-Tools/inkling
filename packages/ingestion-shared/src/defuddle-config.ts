import type { DefuddleOptions } from "defuddle";

// Defuddle is pinned to the same version as the root package.json ("0.19.3").
// Bump both together — the extension bundles Defuddle against the live DOM
// while the app runs it against fetched HTML, and version drift between the
// two would silently change what "extracted" means per entry point.

export const DEFUDDLE_VERSION_PIN = "0.19.3" as const;

type InklingDefuddleOptions = Pick<DefuddleOptions, "removeImages" | "standardize" | "useAsync">;

/**
 * Mirrors src/lib/ingestion/defuddle-adapter.ts by hand; change both together.
 * `useAsync` stays off: content scripts can't rely on third-party fetches.
 */
export const INKLING_DEFUDDLE_OPTIONS: InklingDefuddleOptions = {
  removeImages: false,
  standardize: true,
  useAsync: false,
};
