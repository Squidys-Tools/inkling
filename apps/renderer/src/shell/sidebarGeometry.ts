export const sidebarExpanded = 248;
export const sidebarCompact = 76;

/** A reversal starts from the painted label opacity in either direction. */
export function sidebarLabelFrames(opacity: number, open: boolean, reversing: boolean) {
  return [{ opacity: open && !reversing ? 0 : opacity }, { opacity: open ? 1 : 0 }];
}

/** Clip the retained navigation to the moving frame, preserving the gutter and round edge. */
export const sidebarClip = (frameLeft: number, width: number) =>
  Math.max(0, width - Math.max(0, frameLeft - 8));
