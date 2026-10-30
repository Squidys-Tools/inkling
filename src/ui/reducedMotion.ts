// Null outside a browser, where bun tests import the modules that read it.
export const reducedMotionQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

export function prefersReducedMotion() {
  return reducedMotionQuery?.matches ?? false;
}
