import { desktop } from "../desktop.ts";

/**
 * The URL the window loads a library asset from. Paths are relative to the
 * library folder (`assets/items/<id>/...`); anything else, or any segment that
 * could step outside it, gets no URL rather than a guessed one.
 */
export function assetUrl(path: string | null | undefined, inDesktop = desktop !== undefined) {
  if (!path) return undefined;
  if (!inDesktop) return /^(?:blob:|data:|https?:|\/)/u.test(path) ? path : undefined;
  const relative = path.replaceAll("\\", "/");
  if (!relative.startsWith("assets/")) return undefined;
  const segments = relative.slice("assets/".length).split("/");
  if (
    segments.some(
      (segment) => !segment || segment === "." || segment === ".." || segment.includes(":"),
    )
  )
    return undefined;
  return `app://local/library-assets/${segments.map(encodeURIComponent).join("/")}`;
}

export function webUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function hostname(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return undefined;
  }
}
