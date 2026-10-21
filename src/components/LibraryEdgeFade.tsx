import GradualBlur, { type GradualBlurProps } from "./GradualBlur/GradualBlur";

// The grid scrolls almost to the frame's edges; these blur it out there instead
// of a hard clip. No tint, so the cards soften without darkening. They render in
// the liquid glass backdrop, so the toolbar glass refracts the blur rather than
// being blurred itself.
const EDGE_BLUR: GradualBlurProps = {
  strength: 1.4,
  layers: 5,
  curve: "bezier",
  exponential: true,
  opacity: 1,
  zIndex: 1,
};
const TOP_HEIGHT = 112;
const BOTTOM_HEIGHT = 96;

export function LibraryEdgeFade() {
  return (
    <>
      <GradualBlur {...EDGE_BLUR} position="top" height={TOP_HEIGHT} />
      <GradualBlur {...EDGE_BLUR} position="bottom" height={BOTTOM_HEIGHT} />
    </>
  );
}
