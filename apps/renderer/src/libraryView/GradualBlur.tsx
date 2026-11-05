// Adapted from React Bits' Gradual Blur (https://reactbits.dev/animations/gradual-blur),
// DavidHDev/react-bits @ 1eeb6f1 src/content/Animations/GradualBlur/GradualBlur.jsx.
// Copyright (c) 2026 David Haz, MIT + Commons Clause, as the repo's LICENSE.md @ 1eeb6f1
// grants it; see apps/renderer/licenses/LICENSE-react-bits.md.

import * as stylex from "@stylexjs/stylex";

const layerCount = 5;
const maxBlur = 14;
const height = 30;

type Edge = "top" | "bottom";

// Each layer's backdrop-filter blurs the whole strip and its mask only picks the band that
// shows, so scrolling costs layers x height x radius: grow any of them only after measuring.
function layerStyles(edge: Edge) {
  const direction = edge === "top" ? "to top" : "to bottom";
  const step = 100 / layerCount;
  return Array.from({ length: layerCount }, (_, index) => {
    const layer = index + 1;
    const blur = maxBlur * 2 ** (4 * ((layer / layerCount) ** 2 - 1));
    const stops = [`transparent ${step * (layer - 1)}%`, `black ${step * layer}%`];
    if (layer + 1 <= layerCount) stops.push(`black ${step * (layer + 1)}%`);
    if (layer + 2 <= layerCount) stops.push(`transparent ${step * (layer + 2)}%`);
    return {
      mask: `linear-gradient(${direction}, ${stops.join(", ")})`,
      blur: `blur(${blur.toFixed(2)}px)`,
    };
  });
}

const layers = { top: layerStyles("top"), bottom: layerStyles("bottom") };

export function GradualBlur({ edge }: { edge: Edge }) {
  return (
    <div aria-hidden="true" {...stylex.props(styles.strip, styles[edge])}>
      {layers[edge].map(({ mask, blur }) => (
        <div key={mask} {...stylex.props(styles.layer(mask, blur))} />
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
  layer: (mask: string, blur: string) => ({
    position: "absolute",
    inset: 0,
    maskImage: mask,
    backdropFilter: blur,
  }),
});
