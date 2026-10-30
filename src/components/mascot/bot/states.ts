import {
  COMET_DOT,
  COMET_RIBBONS,
  DOT_PEAK,
  DOT_R,
  DOT_X,
  NOTIF_ANGLE,
  NOTIF_DIST,
  NOTIF_MARGIN,
  NOTIF_POP,
  NOTIF_R,
  particles,
} from "./decor";
import { TAU, clamp, easings } from "./math";
import { INKLING_STATES } from "./inklingStates";
import { ORBIT_STATES } from "./orbitStates";
import { base, pair, type Pose } from "./pose";
import {
  circle,
  hullOfCircles,
  polyPath,
  profileFromPolygon,
  silhouette,
  type Silhouette,
} from "./shape";

/* --------------------------------------------------- formes non radiales */

/**
 * Barre du "!" vertical : enveloppe convexe de deux cercles.
 * Mesure : cercle haut (0, -0.505) r 0.132, cercle bas (0, +0.130) r 0.075,
 * flancs rectilignes. Elle est donc tronconique (rapport haut/bas 1.76).
 */
const BAR_UPRIGHT_CY = -0.1875;
const BAR_UPRIGHT = profileFromPolygon(
  hullOfCircles(0, -0.505, 0.132, 0, 0.13, 0.075),
  0,
  BAR_UPRIGHT_CY,
);

/** Barre du "!" penche : capsule pure (largeur constante 0.269, longueur 0.776). */
const BAR_ITALIC = profileFromPolygon(hullOfCircles(0, -0.2535, 0.1345, 0, 0.2535, 0.1345), 0, 0);

const barUpright = (pose: Partial<Silhouette> = {}): Silhouette => ({
  radii: [...BAR_UPRIGHT],
  rot: 0,
  cx: 0,
  cy: BAR_UPRIGHT_CY,
  sx: 1,
  sy: 1,
  ...pose,
});

const barItalic = (pose: Partial<Silhouette> = {}): Silhouette => ({
  radii: [...BAR_ITALIC],
  rot: 0,
  cx: 0,
  cy: 0,
  sx: 1,
  sy: 1,
  ...pose,
});

/**
 * Le point du "!" penche n'est pas un disque : c'est une goutte, bout rond
 * (r 0.118) du cote de la barre et pointe effilee a l'oppose, longueur 0.300
 * dans l'axe du glyphe. Centree sur le barycentre du bout rond.
 */
const TEAR = polyPath(hullOfCircles(0, 0, 0.118, 0, 0.172, 0.012));

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

/** Onde de pulsation qui parcourt les trois points de gauche a droite. */
function dotPulse(t: number, index: number): number {
  const p = ((((t - index * 0.5) / 1.5) % 1) + 1) % 1;
  const k = p < 0.5 ? 0.5 - 0.5 * Math.cos(p * TAU) : 0;
  return clamp(k * 2);
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
    id: "thinking",
    duration: 2.6,
    morph: 0.4,
    baseFace: false,
    baseBody: false,
    blinkIn: true,
    pose: (t) => {
      const mid = dotPulse(t, 1);
      // Les points lateraux sortent des flancs de la boule : dans la video ils
      // restent fusionnes avec elle 1-2 frames avant de se detacher.
      const emerge = 0.3 + 0.7 * easings.easeOutCubic(clamp(t / 0.3));
      return base({
        // la boule DEVIENT le point du milieu : le morph reste continu
        sil: circle(DOT_R * (1 + (DOT_PEAK - 1) * mid), { cx: DOT_X[1]! }),
        eyeAlpha: 0,
        dots: [0, 2].map((i) => {
          const k = dotPulse(t, i);
          return {
            x: DOT_X[i]! * emerge,
            y: 0,
            r: DOT_R * (1 + (DOT_PEAK - 1) * k),
            opacity: 0.55 + 0.45 * k,
          };
        }),
      });
    },
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
    id: "alert",
    duration: 2.4,
    morph: 0.45,
    baseFace: false,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      // Course mesuree : -0.087 -> +0.732 en 1.5 s, ease-in-out, micro-overshoot.
      const p = clamp(t / 1.5);
      const travel = easings.easeInOutCubic(p) * 0.82 - 0.087;
      const back = t > 1.6 ? clamp((t - 1.6) / 0.4) : 0;
      const x = travel * (1 - back) + 0.1 * back;
      // Vibration secondaire a 2.5 Hz, barre et point en opposition de phase.
      const buzz = Math.sin(t * 2.5 * TAU) * 0.005;
      const tilt = (17.7 * Math.PI) / 180;
      return base({
        sil: barItalic({ rot: tilt, cx: x, cy: -0.325 - buzz }),
        eyeAlpha: 0,
        dots: [
          {
            // le point suit l'axe du glyphe, a 0.580 du centre de la barre
            x: x - Math.sin(tilt) * 0.58,
            y: -0.325 + Math.cos(tilt) * 0.58 + buzz * 2.8,
            r: 0.118,
            d: TEAR,
            rot: (tilt * 180) / Math.PI,
            opacity: 1,
          },
        ],
      });
    },
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
    id: "exclaim",
    duration: 2,
    morph: 0.45,
    baseFace: false,
    baseBody: false,
    blinkIn: false,
    pose: () =>
      base({
        sil: barUpright(),
        eyeAlpha: 0,
        dots: [{ x: -0.012, y: 0.526, r: 0.113, opacity: 1 }],
      }),
  },

  {
    id: "sleep",
    duration: 2.4,
    morph: 0.5,
    baseFace: false,
    baseBody: false,
    blinkIn: false,
    pose: (t) =>
      base({
        // Rebond vertical mesure : +-0.19 autour de +0.11, periode 0.6 s.
        sil: circle(0.1585, { cy: 0.11 + Math.sin(t * (TAU / 0.6)) * 0.19 }),
        eyeAlpha: 0,
      }),
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

  {
    id: "burst",
    duration: 2.6,
    morph: 0.4,
    baseFace: false,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      // Effondrement mesure : 1.0 -> 0.166 en 0.7 s, ease-out, sans rebond.
      const collapse = 1 - 0.834 * easings.easeOutQuint(clamp(t / 0.7));
      const regrow = easings.easeOutQuint(clamp((t - 1.7) / 0.7));
      return base({
        sil: circle(collapse + (1 - collapse) * regrow),
        eyeAlpha: clamp((t - 1.85) / 0.4),
        dots: particles(t, 1),
        dotsBehind: true,
      });
    },
  },

  {
    id: "comet",
    duration: 2.4,
    morph: 0.45,
    baseFace: false,
    baseBody: false,
    blinkIn: false,
    pose: (t) => {
      const collapse = 1 - (1 - COMET_DOT) * easings.easeOutQuint(clamp(t / 0.55));
      const regrow = easings.easeOutQuint(clamp((t - 1.85) / 0.6));
      const fade = clamp((t - 0.15) / 0.25) * clamp((1.95 - t) / 0.3);
      return base({
        // Le point derive de 0.035 vers le bas puis remonte (wobble mesure).
        sil: circle(collapse + (1 - collapse) * regrow, {
          cy: Math.sin(clamp(t / 1.7) * Math.PI) * 0.035,
        }),
        eyeAlpha: clamp((t - 2) / 0.35),
        arcs: COMET_RIBBONS.map((s, i) => ({ id: `cm${i}`, seed: s, t, opacity: fade })),
      });
    },
  },
  ...ORBIT_STATES,
  ...INKLING_STATES,
];

export const STATE_BY_ID = new Map(STATES.map((s) => [s.id, s]));
