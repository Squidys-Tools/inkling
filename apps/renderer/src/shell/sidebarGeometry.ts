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
  rightInset = 0,
) {
  return {
    x: oldInset + current.e - inset,
    scale:
      (Math.max(1, viewport - oldInset - rightInset) * current.a) / Math.max(1, destinationWidth),
  };
}

/** Move bounds without scaling the retained library's contents. */
export function sidebarMotionFrames(fromLeft: number, inset: number, contentWidth: number) {
  return {
    frame: [{ left: `${fromLeft}px` }, { left: `${inset}px` }],
    content: [{ width: `${contentWidth}px` }, { width: `${contentWidth}px` }],
  };
}

/** A reversal starts from the painted label opacity in either direction. */
export function sidebarLabelFrames(opacity: number, open: boolean, reversing: boolean) {
  return [{ opacity: open && !reversing ? 0 : opacity }, { opacity: open ? 1 : 0 }];
}

/** Clip the retained navigation to the moving frame, preserving the gutter and round edge. */
export const sidebarClip = (frameLeft: number, width: number, gap = 8) =>
  Math.max(0, width - Math.max(0, frameLeft - gap));

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
