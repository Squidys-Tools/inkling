type Box = { left: number; top: number; width: number; height: number };

/** Morph only the glass backing; text and the input's hit target never scale. */
export function searchSurfaceFrames(from: Box, to: Box, radius: string) {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;
  const x = from.width / to.width;
  const y = from.height / to.height;
  return [
    {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${x}, ${y})`,
      borderRadius: `${from.height / 2 / x}px / ${from.height / 2 / y}px`,
    },
    { transform: "none", borderRadius: radius },
  ];
}
