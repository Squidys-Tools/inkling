/* oxlint-disable inkling/no-low-value-comments -- vendored from bloub (LICENSE.md); its comments stay as upstream wrote them. */
import { blinkScale, eyePoses, type HeadGaze } from "./face";
import { clamp, r2 } from "./math";
import type { Pose } from "./pose";
import { capsulePath, radiusAtAngle, type Point, type Silhouette } from "./shape";

export interface RenderedEye {
  d: string;
  matrix: string;
  alpha: number;
}

/** One eye about to be drawn: its capsule, tangent frame, lid squash and centre, in viewBox units. */
interface PlacedEye {
  w: number;
  h: number;
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  k: number;
  x: number;
  y: number;
  alpha: number;
}

/** Closest an eye's outline may come to the body's edge, in ball radii. */
const FACE_MARGIN = 0.11;
const OUTLINE_STEPS = 16;

/**
 * INKLING EXTENSION. Moves both eyes together, toward the body's centre, until
 * every point of each capsule sits `FACE_MARGIN` inside the outline. The face
 * keeps its shape and spacing; only its position gives. Each pass pushes by
 * the current overflow, which is continuous in time, so the face glides away
 * from a passing lobe instead of jumping, and `sample` stays a pure function.
 */
function keepFaceInside(eyes: PlacedEye[], sil: Silhouette, cx: number, cy: number, R: number) {
  const squash = Math.min(sil.sx, sil.sy);
  const edge = (x: number, y: number) =>
    radiusAtAngle(sil.radii, Math.atan2(y, x) - sil.rot) * squash * R;
  for (let pass = 0; pass < 3; pass++) {
    let pushX = 0;
    let pushY = 0;
    for (const eye of eyes) {
      const hw = eye.w / 2;
      const hh = eye.h / 2;
      const r = Math.min(hw, hh);
      let overflow = 0;
      for (let i = 0; i < OUTLINE_STEPS; i++) {
        const a = (i / OUTLINE_STEPS) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = Math.sign(ca) * (hw - r) + r * ca;
        const py = Math.sign(sa) * (hh - r) + r * sa;
        const qx = eye.x + eye.ax * px + eye.cx * py - cx;
        const qy = eye.y + (eye.ay * px + eye.cy * py) * eye.k - cy;
        overflow = Math.max(overflow, Math.hypot(qx, qy) + FACE_MARGIN * R - edge(qx, qy));
      }
      const dx = eye.x - cx;
      const dy = eye.y - cy;
      const len = Math.hypot(dx, dy);
      if (overflow <= 0 || len < 1e-6) continue;
      pushX -= (overflow * dx) / len;
      pushY -= (overflow * dy) / len;
    }
    if (pushX === 0 && pushY === 0) return;
    for (const eye of eyes) {
      eye.x += pushX;
      eye.y += pushY;
    }
  }
}

/**
 * Places, tilts and blinks both eyes of `pose`, in viewBox units. `drift` moves
 * the whole figure and `offset` only the face, both in ball radii.
 */
export function renderEyes({
  pose,
  gaze,
  lid,
  bodyRadius,
  drift,
  offset,
  steadyFace,
  R,
}: {
  pose: Pose;
  gaze: HeadGaze;
  lid: number;
  bodyRadius: (x: number, y: number) => number;
  drift: Point;
  offset: Point;
  steadyFace: boolean;
  R: number;
}) {
  if (pose.eyeAlpha <= 0.01) return [];
  const poses = eyePoses(gaze, R, pose.split);
  const placed: PlacedEye[] = [];
  for (let i = 0; i < 2; i++) {
    const e = poses[i]!;
    if (e.depth <= 0.02) continue;
    const cfg = pose.eyes[i]!;
    const fit = bodyRadius(e.x, e.y);
    // Inclinaison propre de l'oeil : on compose le repere tangent avec une
    // rotation dans le plan de l'oeil (Basis x Rot). C'est ce qui permet des
    // inclinaisons en miroir entre les deux yeux.
    const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    // Le clignement s'applique APRES tout ca : c'est un ecrasement vertical
    // a l'ecran, pas le long de l'axe de la gelule.
    const k = blinkScale(Math.min(lid, cfg.open));
    placed.push({
      w: cfg.w * R,
      h: cfg.h * R,
      ax: e.a * cp + e.c * sp,
      ay: e.b * cp + e.d * sp,
      cx: -e.a * sp + e.c * cp,
      cy: -e.b * sp + e.d * cp,
      k,
      x: e.x * fit + (drift.x + offset.x) * R,
      y: e.y * fit + (drift.y + offset.y) * R,
      alpha: pose.eyeAlpha * clamp(e.depth / 0.12),
    });
  }
  // INKLING EXTENSION: a body that drifts under a held face can walk a lobe
  // into the eyes. Slide the whole face inward just enough to keep a margin.
  if (steadyFace) {
    keepFaceInside(placed, pose.sil, (pose.sil.cx + drift.x) * R, (pose.sil.cy + drift.y) * R, R);
  }
  return placed.map((p) => ({
    d: capsulePath(p.w, p.h),
    matrix: `matrix(${r2(p.ax)},${r2(p.ay * p.k)},${r2(p.cx)},${r2(p.cy * p.k)},${r2(p.x)},${r2(p.y)})`,
    alpha: p.alpha,
  }));
}
