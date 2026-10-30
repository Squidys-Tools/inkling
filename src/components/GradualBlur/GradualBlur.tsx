// Adapted from React Bits (https://reactbits.dev/animations/gradual-blur),
// DavidHDev/react-bits @ 310fc737fadcaa149a4e06fb088fc95332dc8bfb,
// src/ts-default/Animations/GradualBlur, trimmed to the top and bottom edge
// blur the library uses. Copyright (c) 2026 David Haz.
// Licensed MIT + Commons Clause v1.0; see LICENSE.md in this directory.

import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

type GradualBlurCurve = "linear" | "bezier" | "ease-in" | "ease-out" | "ease-in-out";

export interface GradualBlurProps {
  position?: "top" | "bottom";
  height?: string | number;
  strength?: number;
  layers?: number;
  curve?: GradualBlurCurve;
  exponential?: boolean;
  opacity?: number;
  saturation?: number;
  tint?: string;
  autoHide?: boolean;
  zIndex?: number;
  className?: string;
}

const CURVES: Record<GradualBlurCurve, (t: number) => number> = {
  linear: (t) => t,
  bezier: (t) => t * t * (3 - 2 * t),
  "ease-in": (t) => t * t,
  "ease-out": (t) => 1 - (1 - t) * (1 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

const FADE = "0.3s ease-out";

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const findScroller = (root: HTMLElement) => {
  const parent = root.parentElement;
  if (!parent) return null;
  const scrolls = (node: Element) => /(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY);
  const sibling = Array.from(parent.children).find((child) => child !== root && scrolls(child));
  return sibling || (scrolls(parent) ? parent : null);
};

const GradualBlur = ({
  position = "bottom",
  height = "6rem",
  strength = 2,
  layers = 8,
  curve = "linear",
  exponential = true,
  opacity = 1,
  saturation = 1,
  tint = "transparent",
  autoHide = false,
  zIndex = 1000,
  className,
}: GradualBlurProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const stack = useMemo(() => {
    const shape = CURVES[curve];
    const maxBlur = strength * 12;
    const level = (u: number) => {
      const t = shape(clamp01(u));
      return maxBlur * (exponential ? (Math.pow(2, 4 * t) - 1) / 15 : t);
    };
    const boost = Math.pow(saturation, 1 / layers);
    const direction = `to ${position}`;
    const steps: CSSProperties[] = [];
    for (let i = 0; i < layers; i++) {
      const from = level(i / layers);
      const to = level((i + 1) / layers);
      const radius = Math.sqrt(Math.max(to * to - from * from, 0));
      const filter = [
        `blur(calc(${radius.toFixed(3)}px * var(--gradual-blur-reveal, 1)))`,
        boost !== 1
          ? `saturate(calc(1 + ${(boost - 1).toFixed(4)} * var(--gradual-blur-reveal, 1)))`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      steps.push({
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        backdropFilter: filter,
        maskImage: `linear-gradient(${direction}, transparent ${((i / layers) * 100).toFixed(2)}%, #000 ${(((i + 1) / layers) * 100).toFixed(2)}%)`,
        opacity,
        transition: `backdrop-filter ${FADE}`,
      });
    }
    const stops = Array.from({ length: 9 }, (_, k) => {
      const u = k / 8;
      const t = shape(u);
      const alpha = t * t * t * (t * (t * 6 - 15) + 10);
      return `rgba(0, 0, 0, ${alpha.toFixed(3)}) ${(u * 100).toFixed(1)}%`;
    }).join(", ");
    const wash: CSSProperties | null =
      tint && tint !== "transparent"
        ? {
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: tint,
            maskImage: `linear-gradient(${direction}, ${stops})`,
            opacity: "var(--gradual-blur-reveal, 1)",
            transition: `opacity ${FADE}`,
          }
        : null;
    return { steps, wash };
  }, [layers, curve, strength, exponential, saturation, position, opacity, tint]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    if (!autoHide) {
      root.style.removeProperty("--gradual-blur-reveal");
      return undefined;
    }
    const scroller = findScroller(root);
    if (!scroller) return undefined;

    const update = () => {
      const offset = scroller.scrollTop;
      const limit = scroller.scrollHeight - scroller.clientHeight;
      const reach = Math.max(root.getBoundingClientRect().height, 1);
      const room = position === "top" ? offset : limit - offset;
      root.style.setProperty("--gradual-blur-reveal", clamp01(room / reach).toFixed(3));
    };

    update();
    scroller.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [autoHide, position]);

  const corner = (edge: "top" | "bottom") => (position === edge ? "inherit" : undefined);
  const rootStyle: CSSProperties = {
    position: "absolute",
    zIndex,
    pointerEvents: "none",
    borderTopLeftRadius: corner("top"),
    borderTopRightRadius: corner("top"),
    borderBottomLeftRadius: corner("bottom"),
    borderBottomRightRadius: corner("bottom"),
    top: position === "top" ? 0 : undefined,
    bottom: position === "bottom" ? 0 : undefined,
    left: 0,
    right: 0,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <div ref={rootRef} className={className} style={rootStyle} aria-hidden="true">
      {stack.steps.map((layer, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a fixed stack of layers that never reorders.
        <div key={index} style={layer} />
      ))}
      {stack.wash && <div style={stack.wash} />}
    </div>
  );
};

export default GradualBlur;
