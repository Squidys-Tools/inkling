// Adapted from React Bits' Gradual Blur (https://reactbits.dev/animations/gradual-blur),
// Copyright (c) 2026 David Haz, MIT + Commons Clause; see apps/renderer/licenses/LICENSE-react-bits.md.

import * as stylex from "@stylexjs/stylex";

const layerCount = 5;
const strength = 2;
const height = 70;

type Edge = "top" | "bottom";

// Ease-in with exponential blur: nearly all of the blur sits at the outer edge.
// A layer's backdrop-filter covers the whole strip and its mask only decides where
// the result shows, so the cost is layers x height x radius.
function layerStyles(edge: Edge) {
  const direction = edge === "top" ? "to top" : "to bottom";
  const step = 100 / layerCount;
  const round = (value: number) => Math.round(value * 10) / 10;
  return Array.from({ length: layerCount }, (_, index) => {
    const layer = index + 1;
    const eased = (layer / layerCount) ** 2;
    const blur = 2 ** (eased * 4) * 0.0625 * strength * 16;
    const stops = [`transparent ${round(step * layer - step)}%`, `black ${round(step * layer)}%`];
    if (step * layer + step <= 100) stops.push(`black ${round(step * layer + step)}%`);
    if (step * layer + step * 2 <= 100)
      stops.push(`transparent ${round(step * layer + step * 2)}%`);
    const mask = `linear-gradient(${direction}, ${stops.join(", ")})`;
    return { maskImage: mask, backdropFilter: `blur(${blur.toFixed(2)}px)` };
  });
}

const layers = { top: layerStyles("top"), bottom: layerStyles("bottom") };

/** Blurs whatever scrolls under the edge of the frame it sits in. */
export function GradualBlur({ edge }: { edge: Edge }) {
  return (
    <div
      aria-hidden="true"
      {...stylex.props(styles.strip, edge === "top" ? styles.top : styles.bottom)}
    >
      {layers[edge].map((style) => (
        <div key={style.maskImage} style={style} {...stylex.props(styles.layer)} />
      ))}
    </div>
  );
}

const styles = stylex.create({
  strip: {
    position: "absolute",
    left: 0,
    right: 0,
    height: `${height}px`,
    zIndex: 1,
    overflow: "hidden",
    pointerEvents: "none",
  },
  top: { top: 0 },
  bottom: { bottom: 0 },
  layer: { position: "absolute", inset: 0 },
});
