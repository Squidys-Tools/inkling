import type { ArcSpec, DotRender } from "./decor";
import { EYE_H, EYE_SPLIT, EYE_W, REST_GAZE, type HeadGaze } from "./face";
import { lerp } from "./math";
import { blend, circle, type Silhouette } from "./shape";

export interface EyeCfg {
  /** largeur locale (axe court de la gelule), en unites de rayon de boule */
  w: number;
  /** hauteur locale (axe long) */
  h: number;
  /** 1 = ouvert, 0 = ferme */
  open: number;
  /**
   * Inclinaison propre de la gelule, en degres, positif = le haut part a
   * droite. Appliquee APRES le repere tangent de la sphere. Sans elle, les deux
   * yeux penchent forcement du meme cote (le roulis de tete) et la colere comme
   * la tristesse, qui demandent des inclinaisons en miroir, sont hors de portee.
   */
  tilt?: number;
}

export interface Pose {
  /** silhouette du corps, en unites de rayon de boule */
  sil: Silhouette;
  gaze: HeadGaze;
  /** demi-ecart des yeux sur la sphere, en degres */
  split: number;
  /** [oeil interieur, oeil exterieur] */
  eyes: [EyeCfg, EyeCfg];
  /** opacite des yeux : sert aux etats sans visage */
  eyeAlpha: number;
  bodyAlpha: number;
  dots: DotRender[];
  arcs: ArcSpec[];
  notif: { x: number; y: number; r: number; notch: number } | null;
  /** true = le decor passe derriere le corps (particules de l'eclatement) */
  dotsBehind: boolean;
}

export const pair = (w: number, h: number): [EyeCfg, EyeCfg] => [
  { w, h, open: 1 },
  { w, h, open: 1 },
];

export function base(over: Partial<Pose> = {}): Pose {
  return {
    sil: circle(1),
    gaze: { ...REST_GAZE },
    split: EYE_SPLIT,
    eyes: pair(EYE_W, EYE_H),
    eyeAlpha: 1,
    bodyAlpha: 1,
    dots: [],
    arcs: [],
    notif: null,
    dotsBehind: false,
    ...over,
  };
}

const lerpEye = (a: EyeCfg, b: EyeCfg, t: number) => ({
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
  open: lerp(a.open, b.open, t),
  tilt: lerp(a.tilt ?? 0, b.tilt ?? 0, t),
});

/** Interpolation de deux poses. Le decor se croise en opacite, pas en geometrie. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out = 1 - t;
  return {
    sil: blend(a.sil, b.sil, t),
    gaze: {
      yaw: lerp(a.gaze.yaw, b.gaze.yaw, t),
      pitch: lerp(a.gaze.pitch, b.gaze.pitch, t),
      roll: lerp(a.gaze.roll, b.gaze.roll, t),
    },
    split: lerp(a.split, b.split, t),
    eyes: [lerpEye(a.eyes[0], b.eyes[0], t), lerpEye(a.eyes[1], b.eyes[1], t)],
    eyeAlpha: lerp(a.eyeAlpha, b.eyeAlpha, t),
    bodyAlpha: lerp(a.bodyAlpha, b.bodyAlpha, t),
    dots: [
      ...a.dots.map((d) => ({ ...d, opacity: d.opacity * out })),
      ...b.dots.map((d) => ({ ...d, opacity: d.opacity * t })),
    ],
    arcs: [
      ...a.arcs.map((r) => ({ ...r, id: `a${r.id}`, opacity: r.opacity * out })),
      ...b.arcs.map((r) => ({ ...r, id: `b${r.id}`, opacity: r.opacity * t })),
    ],
    // la pastille appartient a un seul des deux etats, elle ne se melange pas
    notif: t < 0.5 ? a.notif : b.notif,
    dotsBehind: t < 0.5 ? a.dotsBehind : b.dotsBehind,
  };
}
