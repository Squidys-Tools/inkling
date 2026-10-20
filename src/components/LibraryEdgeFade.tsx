import GradualBlur from "./GradualBlur/GradualBlur";

// Dissolves the grid into the canvas where it clips at the bottom edge.
export function LibraryEdgeFade() {
  return (
    <div className="library-edge-fade" aria-hidden="true">
      <GradualBlur position="bottom" height="100%" strength={1} layers={2} zIndex={0} />
    </div>
  );
}
