import { loadingColor } from "@inkling/ui/tokens.stylex";
import { beam } from "./beam.stylex.ts";

// From border-beam's mono palette; its notice is apps/renderer/licenses/LICENSE-border-beam.md.
/** The colour blobs: width, height, then where each sits on the card. */
const blobs = [
  [70, 40, "33%", "-7.4%"],
  [60, 35, "12%", "-5%"],
  [40, 70, "2.1%", "68.3%"],
  [20, 35, "2.1%", "68.3%"],
  [180, 32, "74.4%", "100%"],
  [85, 26, "55%", "100%"],
  [74, 32, "93.9%", "0%"],
  [26, 42, "100%", "27.1%"],
  [52, 48, "100%", "27.1%"],
] as const;

const blobLayers = (scale: number, tints: readonly [string, string]) =>
  blobs
    .map(
      ([width, height, x, y], index) =>
        `radial-gradient(ellipse ${width * scale}px ${height * scale}px at ${x} ${y}, ${tints[index % 2]}, transparent)`,
    )
    .join(", ");

const { beamLightFaint: faint, beamLightSoft: soft, beamLightMid: mid } = loadingColor;
const { beamLightStrong: strong } = loadingColor;
export const solid = `linear-gradient(${loadingColor.beamMask} 0 0)`;
const arc = (stops: string) => `conic-gradient(from ${beam.angle}, ${stops})`;

/** The turning window: opaque where the beam shows, clear elsewhere. */
export const beamWindow = arc(
  `transparent 0% 30%, ${faint} 36%, ${soft} 44%, ${loadingColor.beamMask} 52% 80%, ${soft} 86%, ${faint} 92%, transparent 95% 100%`,
);

/** The 1px edge: a bright core with the colour blobs showing under it. */
export const beamStroke = [
  arc(
    `transparent 0% 54%, ${faint} 57%, ${soft} 60%, ${mid} 63%, ${strong} 66%, ${mid} 69%, ${soft} 72%, ${faint} 75%, transparent 78% 100%`,
  ),
  blobLayers(1, [loadingColor.beamTint, loadingColor.beamTintDeep]),
].join(", ");

/** The light bleeding inward from the edge. */
export const beamGlow = blobLayers(0.9, [loadingColor.beamTintSoft, loadingColor.beamTintDeepSoft]);

export const beamBloom = arc(
  `transparent 0% 58%, ${faint} 65%, ${soft} 68%, ${strong} 70% 70.5%, ${soft} 72%, ${faint} 76%, transparent 82%`,
);

/** Keeps the glow to the edges: fading in from the top and bottom, and from the left and right. */
export const beamEdges = [
  `linear-gradient(${loadingColor.beamMask}, transparent 28px, transparent calc(100% - 28px), ${loadingColor.beamMask})`,
  `linear-gradient(to right, ${loadingColor.beamMask}, transparent 28px, transparent calc(100% - 28px), ${loadingColor.beamMask})`,
].join(", ");
