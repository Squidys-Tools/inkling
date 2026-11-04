export const sidebarExpanded = 248;
export const sidebarCompact = 76;

/** Move real bounds, never a scaled picture or a narrower fixed-width child. */
export function sidebarMotionFrames(fromLeft: number, inset: number) {
  return {
    frame: [{ left: `${fromLeft}px` }, { left: `${inset}px` }],
    content: [
      { width: "auto", left: "0px", right: "0px" },
      { width: "auto", left: "0px", right: "0px" },
    ],
  };
}

/** A reversal starts from the painted label opacity in either direction. */
export function sidebarLabelFrames(opacity: number, open: boolean, reversing: boolean) {
  return [{ opacity: open && !reversing ? 0 : opacity }, { opacity: open ? 1 : 0 }];
}

/** Clip the retained navigation to the moving frame, preserving the gutter and round edge. */
export const sidebarClip = (frameLeft: number, width: number) =>
  Math.max(0, width - Math.max(0, frameLeft - 8));
