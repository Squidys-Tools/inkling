export const sidebarExpanded = 248;
export const sidebarCompact = 76;
export const sidebarBreakpoint = 780;

// A compact Codex rail never vanishes; on narrow screens an open sidebar overlays.
export function sidebarGeometry(viewport: number, open: boolean) {
  const narrow = viewport <= sidebarBreakpoint;
  const inset = narrow && open ? 0 : open ? sidebarExpanded : sidebarCompact;
  return {
    narrow,
    inset,
    sidebarWidth: open ? sidebarExpanded : sidebarCompact,
    contentWidth: Math.max(0, viewport - inset),
    scrim: narrow && open,
  };
}
