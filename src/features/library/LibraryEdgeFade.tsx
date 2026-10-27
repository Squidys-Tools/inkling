import GradualBlur, { type GradualBlurProps } from "../../components/GradualBlur/GradualBlur";

// Blurs the grid out at the frame edges instead of hard-clipping it. Rendered in
// the liquid glass backdrop so the toolbar glass refracts the blur. Values are
// React Bits' "Peek" preset; tint #120f17 at 0.15.
const EDGE_BLUR: GradualBlurProps = {
  height: "6rem",
  strength: 1,
  layers: 5,
  curve: "ease-in",
  exponential: true,
  opacity: 1,
  saturation: 1,
  tint: "rgba(18, 15, 23, 0.15)",
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
