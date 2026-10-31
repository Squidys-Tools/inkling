import { FACE_STATES } from "./faceStates";
import { GLYPH_STATES } from "./glyphStates";
import { INKLING_STATES } from "./inklingStates";
import { ORBIT_STATES } from "./orbitStates";
import type { Pose } from "./pose";

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

export const STATES = [...FACE_STATES, ...GLYPH_STATES, ...ORBIT_STATES, ...INKLING_STATES];

export const STATE_BY_ID = new Map(STATES.map((s) => [s.id, s]));
