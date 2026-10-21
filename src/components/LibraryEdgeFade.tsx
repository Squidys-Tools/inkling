import GradualBlur, { type GradualBlurProps } from "./GradualBlur/GradualBlur";

// The grid scrolls almost to the frame's edges; these blur it out there instead
// of a hard clip. They render in the liquid glass backdrop, so the toolbar glass
// refracts the blur rather than being blurred itself. Values are the React Bits
// "Peek" preset as tuned on reactbits.dev; the tint is #120f17 at its 0.15 tint
// amount. Hover intensity 0 clears a band while the pointer is over it.
const EDGE_BLUR: GradualBlurProps = {
  height: "6rem",
  strength: 1,
  layers: 5,
  curve: "ease-in",
  exponential: true,
  opacity: 1,
  saturation: 1,
  tint: "rgba(18, 15, 23, 0.15)",
  hoverIntensity: 0,
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
