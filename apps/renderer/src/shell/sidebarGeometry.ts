export const sidebarExpanded = 248;
export const sidebarCompact = 76;
const sidebarBreakpoint = 780;

/** Invert the destination layout to the bounds actually painted by a previous flight. */
export function sidebarFlight(
  oldInset: number,
  inset: number,
  viewport: number,
  destinationWidth: number,
  current: { a: number; e: number },
) {
  return {
    x: oldInset + current.e - inset,
    scale: (Math.max(1, viewport - oldInset) * current.a) / Math.max(1, destinationWidth),
  };
}

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
