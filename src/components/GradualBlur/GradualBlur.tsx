// Adapted from React Bits (https://reactbits.dev/animations/gradual-blur),
// DavidHDev/react-bits @ 310fc737fadcaa149a4e06fb088fc95332dc8bfb,
// src/ts-default/Animations/GradualBlur, trimmed to the top and bottom edge
// blur the library uses. Copyright (c) 2026 David Haz.
// Licensed MIT + Commons Clause v1.0; see LICENSE.md in this directory.

import { useMemo, type CSSProperties } from "react";

type GradualBlurCurve = "linear" | "bezier" | "ease-in" | "ease-out" | "ease-in-out";

export interface GradualBlurProps {
  position?: "top" | "bottom";
  strength?: number;
  layers?: number;
  curve?: GradualBlurCurve;
  tint?: string;
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

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const GradualBlur = ({
  position = "bottom",
  strength = 2,
  layers = 8,
  curve = "linear",
  tint = "transparent",
  zIndex = 1000,
  className,
}: GradualBlurProps) => {
  const stack = useMemo(() => {
    const shape = CURVES[curve];
    const maxBlur = strength * 12;
    const level = (u: number) => {
      const t = shape(clamp01(u));
      return maxBlur * ((Math.pow(2, 4 * t) - 1) / 15);
    };
    const direction = `to ${position}`;
    const steps: CSSProperties[] = [];
    for (let i = 0; i < layers; i++) {
      const from = level(i / layers);
      const to = level((i + 1) / layers);
      const radius = Math.sqrt(Math.max(to * to - from * from, 0));
      steps.push({
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        backdropFilter: `blur(${radius.toFixed(3)}px)`,
        maskImage: `linear-gradient(${direction}, transparent ${((i / layers) * 100).toFixed(2)}%, #000 ${(((i + 1) / layers) * 100).toFixed(2)}%)`,
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
          }
        : null;
    return { steps, wash };
  }, [layers, curve, strength, position, tint]);

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
    height: "6rem",
  };

  return (
    <div className={className} style={rootStyle} aria-hidden="true">
      {stack.steps.map((layer, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a fixed stack of layers that never reorders.
        <div key={index} style={layer} />
      ))}
      {stack.wash && <div style={stack.wash} />}
    </div>
  );
};

export default GradualBlur;
