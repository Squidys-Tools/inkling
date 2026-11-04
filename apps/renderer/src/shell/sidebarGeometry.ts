export const sidebarExpanded = 248;
export const sidebarCompact = 76;

/**
 * Labels fade out before the moving edge reaches them and fade in only once it
 * has passed, so no word is shown sliced. A reversal starts from the painted opacity.
 */
export function sidebarLabelFrames(opacity: number, open: boolean, reversing: boolean) {
  return open
    ? [
        { opacity: reversing ? opacity : 0, offset: 0 },
        { opacity: 0, offset: 0.8 },
        { opacity: 1, offset: 1 },
      ]
    : [
        { opacity, offset: 0 },
        { opacity: 0, offset: 0.18 },
        { opacity: 0, offset: 1 },
      ];
}

/** Clip the retained navigation to the moving frame, preserving the gutter and round edge. */
export const sidebarClip = (frameLeft: number, width: number) =>
  Math.max(0, width - Math.max(0, frameLeft - 8));
