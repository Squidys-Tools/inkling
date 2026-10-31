import { PROFILE_SAMPLES } from "./profiles";

/**
 * Rest bodies a caller can pick. Unlike the animation silhouettes in
 * `profiles.ts`, these are not measured from the reference video.
 */

type ShapeId =
  | "cercle"
  // INKLING EXTENSION: organic ink-blot shape for the inkling mascot, drawn
  // from the "Inkling mascots" frame in Paper (node 3WH-0 "Organic body shape").
  | "inkling-splash";

export interface BotShape {
  id: ShapeId;
  radii: number[];
}

/**
 * INKLING EXTENSION — a five-lobed approximation of the Paper splatter, peak
 * normalized to 1.06 so it weighs the same next to the circle. Listing it in
 * `SHAPES` registers it in the eyefit table built at import.
 */
const inklingSplash = (() => {
  const raw = Array.from({ length: PROFILE_SAMPLES }, (_, i) => {
    const a = (i / PROFILE_SAMPLES) * Math.PI * 2;
    return 1 + 0.09 * Math.cos(5 * a + 0.8) + 0.05 * Math.cos(2 * a + 2.0);
  });
  const k = 1.06 / Math.max(...raw);
  return raw.map((r) => r * k);
})();

export const SHAPES: BotShape[] = [
  { id: "cercle", radii: new Array(PROFILE_SAMPLES).fill(1) },
  { id: "inkling-splash", radii: inklingSplash },
];

// Keyed by `string`: callers look up an unvalidated prop.
export const SHAPE_BY_ID = new Map<string, BotShape>(SHAPES.map((s) => [s.id, s]));

/** Melange deux couleurs hex. Sert a la brume de profondeur des particules. */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const a = parse(from);
  const b = parse(to);
  const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
