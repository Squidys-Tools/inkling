import { NOTIF_ANGLE, NOTIF_DIST, NOTIF_MARGIN, NOTIF_POP, NOTIF_R } from "./decor";
import { GLYPH_STATES } from "./glyphStates";
import { INKLING_STATES } from "./inklingStates";
import { clamp } from "./math";
import { ORBIT_STATES } from "./orbitStates";
import { base, pair, type Pose } from "./pose";
import { silhouette } from "./shape";

/* ------------------------------------------------------------------ etats */

export type StateId =
  | "idle"
  | "thinking"
  | "wink"
  | "wide"
  | "alert"
  | "notify"
  | "exclaim"
  | "sleep"
  | "egg"
  | "hexagon"
  | "play"
  | "orbit"
  | "burst"
  | "comet"
  /** transition d'interface, pas une animation du catalogue : hors `SEQUENCE` */
  | "swirl"
  // INKLING EXTENSION, see `inklingStates.ts`.
  | "inkling-sway"
  | "inkling-jelly"
  | "inkling-drift"
  | "inkling-drift-faced";

export interface StateDef {
  id: StateId;
  /** duree de maintien quand la sequence complete est jouee */
  duration: number;
  /** duree du morph d'entree */
  morph: number;
  /** true = l'entree est masquee par un clignement, comme dans la video */
  blinkIn: boolean;
  /**
   * true = le corps est la silhouette "au repos", donc remplacable par la forme
   * choisie dans le personnalisateur. Les etats qui dessinent leur propre forme
   * (le "!", les points, l'oeuf, le triangle...) valent false : c'est cette forme
   * la qui EST l'animation.
   */
  baseBody: boolean;
  /**
   * true = l'etat porte le visage "au repos", donc remplacable par l'expression
   * choisie. Seul `idle` : les autres etats a visage ont une expression relevee
   * sur la video, c'est precisement ce qu'on reproduit.
   */
  baseFace: boolean;
  /**
   * INKLING EXTENSION, optional: true = le visage reste pose pendant que la
   * chair bouge. Le moteur saute alors la remise au prorata du rayon corporel
   * (`radiusAtAngle`), qui pomperait l'ecart des yeux chaque fois qu'un lobe
   * passerait dessous. Absent = comportement d'origine, inchange.
   */
  steadyFace?: boolean;
  pose(local: number): Pose;
}

export const STATES: StateDef[] = [
  {
    id: "idle",
    duration: 2.4,
    morph: 0.45,
    blinkIn: false,
    baseFace: true,
    baseBody: true,
    pose: () => base(),
  },

  {
    id: "wink",
    duration: 1.6,
    morph: 0.3,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
        split: 16.25,
        // L'oeil ferme n'est pas l'oeil ouvert ecrase : c'est un tiret
        // horizontal PLUS LARGE que l'oeil ouvert (0.447 contre 0.236).
        eyes: [
          { w: 0.236, h: 0.464, open: 1 },
          { w: 0.447, h: 0.089, open: 1 },
        ],
      }),
  },

  {
    id: "wide",
    duration: 1.8,
    morph: 0.55,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: () =>
      base({
        gaze: { yaw: 6.92, pitch: -21.96, roll: 11.6 },
        split: 18.43,
        eyes: pair(0.356, 0.875),
      }),
  },

  {
    id: "notify",
    duration: 2.2,
    morph: 0.5,
    blinkIn: true,
    baseFace: false,
    baseBody: true,
    pose: (t) => {
      // Pop du point bleu : pic a +14 % vers 0.3 s puis stabilisation.
      const p = clamp(t / 0.45);
      const pop = 1 + (NOTIF_POP - 1) * Math.sin(p * Math.PI) * (1 - p * 0.35);
      const r = NOTIF_R * (p < 1 ? pop : 1);
      const a = (NOTIF_ANGLE * Math.PI) / 180;
      return base({
        // le regard part a l'oppose de la pastille
        gaze: { yaw: -21.94, pitch: -5.82, roll: -12.2 },
        split: 18.89,
        eyes: pair(0.505, 0.498),
        notif: {
          x: Math.cos(a) * NOTIF_DIST,
          y: Math.sin(a) * NOTIF_DIST,
          r,
          notch: r + NOTIF_MARGIN,
        },
      });
    },
  },

  {
    id: "egg",
    duration: 1.8,
    morph: 0.4,
    baseFace: false,
    baseBody: false,
    blinkIn: true,
    pose: () =>
      base({
        sil: silhouette("egg"),
        gaze: { yaw: 19.97, pitch: 26.01, roll: -17.1 },
        // les yeux se resserrent comme le corps
        split: 11.07,
        eyes: pair(0.164, 0.385),
      }),
  },

  {
    id: "hexagon",
    duration: 1.6,
    morph: 0.4,
    baseFace: false,
    baseBody: false,
    blinkIn: true,
    pose: () =>
      base({
        sil: silhouette("hexagon"),
        gaze: { yaw: 23.11, pitch: 24.42, roll: -13.3 },
        split: 13.37,
        eyes: pair(0.177, 0.411),
      }),
  },
  ...GLYPH_STATES,
  ...ORBIT_STATES,
  ...INKLING_STATES,
];

export const STATE_BY_ID = new Map(STATES.map((s) => [s.id, s]));
