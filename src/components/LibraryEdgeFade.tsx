import GradualBlur, { type GradualBlurProps } from "./GradualBlur/GradualBlur";

// The grid scrolls almost to the frame's edges; these blur it out there instead
// of a hard clip. They render in the liquid glass backdrop, so the toolbar glass
// refracts the blur rather than being blurred itself. Values are the React Bits
// "Subtle" preset as tuned on reactbits.dev; the tint is #120f17 at its 0.3
// tint amount.
const EDGE_BLUR: GradualBlurProps = {
  height: "4rem",
  strength: 1,
  layers: 8,
  curve: "ease-in",
  exponential: true,
  opacity: 1,
  saturation: 1,
  tint: "rgba(18, 15, 23, 0.3)",
  hoverIntensity: 1,
  autoHide: false,
  zIndex: 1,
  className: "library-edge-blur",
};

export function LibraryEdgeFade() {
  return (
    <>
      <GradualBlur {...EDGE_BLUR} position="top" />
      <GradualBlur {...EDGE_BLUR} position="bottom" />
    </>
  );
}
