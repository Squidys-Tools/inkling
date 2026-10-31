import type { CardScope } from "@inkling/contracts";

export type ScopeKey = string;

export const activeScope: CardScope = { _tag: "Active" };
export const archivedScope: CardScope = { _tag: "Archived" };
const spaceScope = (spaceId: string): CardScope => ({ _tag: "Space", spaceId });

export const scopeKey = (scope: CardScope): ScopeKey =>
  scope._tag === "Space" ? `space:${scope.spaceId}` : scope._tag;

/**
 * The scope a library route shows, or null for a page that covers the grid.
 * The grid stays mounted under pages, so it keeps the last scope it had.
 */
export function scopeFromPath(pathname: string): CardScope | null {
  if (pathname === "/" || pathname === "") return activeScope;
  if (pathname === "/archive") return archivedScope;
  const space = /^\/space\/([^/]+)\/?$/u.exec(pathname);
  return space ? spaceScope(decodeURIComponent(space[1])) : null;
}
