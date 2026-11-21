import type { WindowChrome } from "@inkling/contracts/desktop";

export const sidebarExpanded = 248;
export const sidebarCompact = 56;
// macOS traffic lights span x=12..64; the rail stays wide enough that the stage clears them.
export const sidebarCompactNativeLeft = 76;

export const compactSidebarWidth = (controls: WindowChrome["controls"]) =>
  controls === "native-left" ? sidebarCompactNativeLeft : sidebarCompact;

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

/** How many rows a dragged Space has crossed, held inside the list. `+ 0` turns -0 into 0. */
export const dragSteps = (offset: number, pitch: number, index: number, lastIndex: number) =>
  Math.max(-index, Math.min(lastIndex - index, Math.round(offset / pitch))) + 0;

/** Clip the retained navigation to the moving frame edge. */
export const sidebarClip = (frameLeft: number, width: number) =>
  Math.max(0, width - Math.max(0, frameLeft));
