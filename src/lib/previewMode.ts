// Web preview seed mode — preview/dev-only, never active in the Tauri desktop app.
//
// The Vite frontend already renders seed data in a plain browser (no Tauri
// internals). This module pins that behavior behind one explicit helper so a
// statically hosted `dist/` (Cloudflare Pages, Vercel, `vite preview`) shows a
// deterministic library without ever invoking Tauri commands.
//
// Production safety: inside a real Tauri webview this returns false unless the
// build was made with VITE_INKLING_PREVIEW=1 AND the URL carries ?preview=1,
// and dev (?preview=1 with import.meta.env.DEV) is the only other opt-in.
// Plain browsers (no __TAURI_INTERNALS__) always use seeds — there is no
// backend to call there.
import { isTauriRuntime } from "./libraryApi";

export function hasPreviewQuery(search: string): boolean {
  try {
    return new URLSearchParams(search).get("preview") === "1";
  } catch {
    return false;
  }
}

export function isPreviewBuildFlag(env: unknown): boolean {
  if (!env || typeof env !== "object") return false;
  return (env as Record<string, unknown>).VITE_INKLING_PREVIEW === "1";
}

export function isDevFlag(env: unknown): boolean {
  if (!env || typeof env !== "object") return false;
  return (env as Record<string, unknown>).DEV === true;
}

export type SeedLibraryOptions = {
  search?: string;
  dev?: boolean;
  previewBuild?: boolean;
  tauri?: boolean;
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
  const tauri = options?.tauri ?? isTauriRuntime();
  if (!tauri) return true;
  const search = options?.search ?? currentSearch();
  if (!hasPreviewQuery(search)) return false;
  const env = currentEnv();
  const dev = options?.dev ?? isDevFlag(env);
  const previewBuild = options?.previewBuild ?? isPreviewBuildFlag(env);
  return dev || previewBuild;
}
