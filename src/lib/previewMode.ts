// Seed data without a native bridge, so a static `dist/` shows a fixed library.
// In the desktop app this stays false unless built with VITE_INKLING_PREVIEW=1
// and the URL has ?preview=1, or in dev with ?preview=1.
import { isDesktopRuntime } from "./libraryApi";

type SeedLibraryOptions = {
  search?: string;
  dev?: boolean;
  previewBuild?: boolean;
  desktop?: boolean;
};

// Injectable options exist so bun tests can cover every branch without DOM.
export function shouldUseSeedLibrary(options: SeedLibraryOptions = {}): boolean {
  if (!(options.desktop ?? isDesktopRuntime())) return true;
  const search = options.search ?? (typeof window === "undefined" ? "" : window.location.search);
  if (new URLSearchParams(search).get("preview") !== "1") return false;
  const dev = options.dev ?? import.meta.env.DEV === true;
  const previewBuild = options.previewBuild ?? import.meta.env.VITE_INKLING_PREVIEW === "1";
  return dev || previewBuild;
}
