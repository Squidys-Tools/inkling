import GradualBlur, { type GradualBlurProps } from "./GradualBlur/GradualBlur";

// The grid scrolls almost to the frame's edges; these blur it out there instead
// of a hard clip. No tint, so the cards soften without darkening.
const EDGE_BLUR: GradualBlurProps = {
  strength: 2,
  layers: 5,
  curve: "bezier",
  exponential: true,
  opacity: 1,
  zIndex: 1,
};
const TOP_HEIGHT = 88;
const BOTTOM_HEIGHT = 72;

export function LibraryEdgeFade() {
  return (
    <>
      <GradualBlur {...EDGE_BLUR} position="top" height={TOP_HEIGHT} />
      <GradualBlur {...EDGE_BLUR} position="bottom" height={BOTTOM_HEIGHT} />
    </>
  );
}
