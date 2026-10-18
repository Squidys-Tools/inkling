import GradualBlur from "./GradualBlur/GradualBlur";

export function LibraryEdgeFade({ edge }: { edge: "top" | "bottom" }) {
  return (
    <div className={`library-edge-fade is-${edge}`} aria-hidden="true">
      <GradualBlur
        position={edge}
        height="100%"
        strength={1}
        layers={edge === "top" ? 1 : 2}
        zIndex={0}
      />
    </div>
  );
}
