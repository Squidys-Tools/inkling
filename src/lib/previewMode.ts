// Seed data without a native bridge, so a static `dist/` shows a fixed library.
// In the desktop app this stays false unless built with VITE_INKLING_PREVIEW=1
// and the URL has ?preview=1, or in dev with ?preview=1.
import { isDesktopRuntime } from "./libraryApi";

function hasPreviewQuery(search: string): boolean {
  try {
    return new URLSearchParams(search).get("preview") === "1";
  } catch {
    return false;
  }
}

function isPreviewBuildFlag(env: unknown): boolean {
  if (!env || typeof env !== "object") return false;
  return (env as Record<string, unknown>).VITE_INKLING_PREVIEW === "1";
}

function isDevFlag(env: unknown): boolean {
  if (!env || typeof env !== "object") return false;
  return (env as Record<string, unknown>).DEV === true;
}

export type SeedLibraryOptions = {
  search?: string;
  dev?: boolean;
  previewBuild?: boolean;
  desktop?: boolean;
};

function currentSearch(): string {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

function currentEnv(): Record<string, unknown> {
  try {
    return (import.meta as unknown as { env: Record<string, unknown> }).env ?? {};
  } catch {
    return {};
  }
}

// Injectable options exist so bun tests can cover every branch without DOM.
export function shouldUseSeedLibrary(options?: SeedLibraryOptions): boolean {
  const desktop = options?.desktop ?? isDesktopRuntime();
  if (!desktop) return true;
  const search = options?.search ?? currentSearch();
  if (!hasPreviewQuery(search)) return false;
  const env = currentEnv();
  const dev = options?.dev ?? isDevFlag(env);
  const previewBuild = options?.previewBuild ?? isPreviewBuildFlag(env);
  return dev || previewBuild;
}
