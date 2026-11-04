type Box = { left: number; top: number; width: number; height: number };

/** Animate the enclosing bounds, never a smaller backing behind destination text. */
export function searchSurfaceFrames(from: Box, to: Box, radius: string, top = 0) {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  return [
    {
      width: `${from.width}px`,
      height: `${from.height}px`,
      top: `${top + from.top - to.top}px`,
      minWidth: "0px",
      borderRadius: `${from.height / 2}px`,
    },
    {
      width: `${to.width}px`,
      height: `${to.height}px`,
      top: `${top}px`,
      minWidth: "0px",
      borderRadius: radius,
    },
  ];
}
