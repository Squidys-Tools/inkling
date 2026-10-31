/* oxlint-disable inkling/no-low-value-comments -- vendored from bloub (LICENSE.md); its comments stay as upstream wrote them. */
/**
 * Where to put the face on a non-circular body. The engine scales each eye's
 * centre to the body's radius in its direction, but not its size, so a narrow
 * body pushes the capsule into the edge until the mask cuts it open.
 *
 * The fix is a table of offsets solved once at import, never per frame. Every
 * per-frame solver tried reacted to gaze drift, the pointer and morphs at once
 * and visibly shook; interpolating between two table entries cannot. Solving
 * offline also lets the solver cover the whole gaze drift envelope.
 */

import { EXPRESSIONS, type BotExpression } from "./expressions";
import { eyePoses } from "./face";
import { radiusAtAngle, toPoints, type Point } from "./shape";
import { SHAPES, SHAPE_BY_ID } from "./skins";
import type { Pose } from "./pose";
import { STATES, type StateDef, type StateId } from "./states";

/** The solver's ball radius; offsets come out in units of it. */
const R = 100;

/**
 * Exact bounds of `liveliness`'s drift (`loopNoise` is bounded by 1). Solving
 * only the nominal pose let the eyes overflow a second later.
 */
const DERIVE_YAW = 5.5 + 1.6;
const DERIVE_PITCH = 4.2 + 1.3;
/** Centre float, in ball radii. */
const DERIVE_X = 0.006;
const DERIVE_Y = 0.007;

interface Visage {
  gaze: Pose["gaze"];
  split: number;
  eyes: Pose["eyes"];
}

/**
 * One eye capsule, ready to measure: a segment thickened by a disc of radius
 * `r`, mapped by the tangent matrix into a segment thickened by an ellipse.
 * The clearance it needs in direction u is that ellipse's support function,
 * `r * |A^T u|`; its largest singular value is conservative but wrong in the
 * one direction that matters.
 */
interface Empreinte {
  /** centre, viewBox units */
  x: number;
  y: number;
  /** half axis vector */
  ax: number;
  ay: number;
  /** disc radius before the tangent matrix */
  r: number;
  /** tangent matrix columns, for the support function */
  m: [number, number, number, number];
}

/** Both eyes of `visage` on profile `radii`, open: a blink needs no room. */
function empreintes(visage: Visage, sil: Pose["sil"], radii: number[]): Empreinte[] {
  const out: Empreinte[] = [];
  const poses = eyePoses(visage.gaze, R, visage.split);
  for (let i = 0; i < 2; i++) {
    const e = poses[i]!;
    if (e.depth <= 0.02) continue;
    const cfg = visage.eyes[i]!;
    const phi = ((cfg.tilt ?? 0) * Math.PI) / 180;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const ax = e.a * cp + e.c * sp;
    const ay = e.b * cp + e.d * sp;
    const cx = -e.a * sp + e.c * cp;
    const cy = -e.b * sp + e.d * cp;

    const hw = Math.max(cfg.w * R, 0.01) / 2;
    const hh = Math.max(cfg.h * R, 0.01) / 2;
    const r = Math.min(hw, hh);
    const long = hh > hw;
    const demi = long ? hh - r : hw - r;
    // scaled to the local radius exactly as the engine does
    const fit = radiusAtAngle(radii, Math.atan2(e.y, e.x) - sil.rot);
    out.push({
      x: e.x * fit,
      y: e.y * fit,
      ax: (long ? cx : ax) * demi,
      ay: (long ? cy : ay) * demi,
      r,
      m: [ax, ay, cx, cy],
    });
  }
  return out;
}

/** Shortest gap from outline `pts` to a segment, and the unit vector that widens it. */
function approche(pts: Point[], x0: number, y0: number, x1: number, y1: number) {
  const sx = x1 - x0;
  const sy = y1 - y0;
  const len2 = sx * sx + sy * sy;
  let best = Infinity;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    let t = len2 > 0 ? ((p.x - x0) * sx + (p.y - y0) * sy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x0 + t * sx - p.x;
    const ey = y0 + t * sy - p.y;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) {
      best = d2;
      vx = ex;
      vy = ey;
    }
  }
  const d = Math.sqrt(best);
  return { d, ux: d > 1e-9 ? vx / d : 0, uy: d > 1e-9 ? vy / d : 0 };
}

/** Capsules to fit in a contour, with the reference profile they are measured against. */
interface Epreuve {
  empreintes: Empreinte[];
  reference: Empreinte[];
  contour: Point[];
  calContour: Point[];
}

/** The centre float, folded into each capsule's radius rather than tested at four corners. */
const FLOTTEMENT = Math.hypot(DERIVE_X, DERIVE_Y) * R;

/** The tightest capsule's margin, and the direction that widens it. */
function pire(pts: Point[], emps: Empreinte[], tx: number, ty: number) {
  let marge = Infinity;
  let ux = 0;
  let uy = 0;
  for (const e of emps) {
    const x = e.x + tx;
    const y = e.y + ty;
    const a = approche(pts, x - e.ax, y - e.ay, x + e.ax, y + e.ay);
    const [m0, m1, m2, m3] = e.m;
    const rayon = e.r * Math.hypot(m0 * a.ux + m1 * a.uy, m2 * a.ux + m3 * a.uy) + FLOTTEMENT;
    if (a.d - rayon < marge) {
      marge = a.d - rayon;
      ux = a.ux;
      uy = a.uy;
    }
  }
  return { marge, ux, uy };
}

/** Directions probed and bisection steps; their product is the table's build cost. */
const DIRECTIONS = 12;
const DICHOTOMIE = 8;

/**
 * One translation for both eyes, so spacing, size and tilt are kept: the face
 * just sits lower on a body with no room up top. The target margin is the
 * circle's own (the outer eye nearly grazes the edge there, which gives the
 * volume), capped by what the body's centre offers.
 *
 * Directional search, not descent: clearing one edge moves the pair toward
 * another, and a gradient descent never converged. Each probed direction is
 * bisected exactly instead.
 *
 * INKLING EXTENSION: the splash needs more room than the circle's graze to
 * read as clear of the edge; the bonus raises its target only.
 */
const BONUS_MARGE_SPLASH = 12;

function bonusPour(radii: number[]): number {
  return radii === SHAPE_BY_ID.get("inkling-splash")?.radii ? BONUS_MARGE_SPLASH : 0;
}

function resous(epreuves: Epreuve[], bonus = 0): { x: number; y: number } {
  if (!epreuves.length) return { x: 0, y: 0 };

  const marge = (tx: number, ty: number) => {
    let m = Infinity;
    for (const ep of epreuves) m = Math.min(m, pire(ep.contour, ep.empreintes, tx, ty).marge);
    return m;
  };

  // The target: the original profile's tightest margin, capped by the centre's.
  let requis = Infinity;
  for (const ep of epreuves) {
    requis = Math.min(requis, pire(ep.calContour, ep.reference, 0, 0).marge);
  }
  requis += bonus;
  // The search must reach the body's centre, where `wide`'s long eyes fit.
  let mx = 0;
  let my = 0;
  const emps = epreuves[0]!.empreintes;
  for (const e of emps) {
    mx -= e.x / emps.length;
    my -= e.y / emps.length;
  }
  const course = Math.max(0.35 * R, Math.hypot(mx, my) * 1.25);

  requis = Math.min(requis, marge(mx, my));

  // Done when the eyes fit and are no tighter than on the original profile. On a
  // body where nothing fits, aim for the least bad offset instead of giving up.
  const depart = marge(0, 0);
  if (depart >= requis && depart >= 0) return { x: 0, y: 0 };
  const cible = Math.max(requis, 0);

  let meilleurX = 0;
  let meilleurY = 0;
  let meilleureNorme = Infinity;
  // Fallback when nothing fits: the widest margin seen while probing.
  let secoursX = 0;
  let secoursY = 0;
  let secours = depart;

  for (let d = 0; d < DIRECTIONS; d++) {
    const a = (d / DIRECTIONS) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    if (marge(ux * course, uy * course) < cible) {
      for (const k of [0.3, 0.6, 1]) {
        const m = marge(ux * course * k, uy * course * k);
        if (m > secours) {
          secours = m;
          secoursX = ux * course * k;
          secoursY = uy * course * k;
        }
      }
      continue;
    }
    let bas = 0;
    let haut = course;
    for (let i = 0; i < DICHOTOMIE; i++) {
      const mid = (bas + haut) / 2;
      if (marge(ux * mid, uy * mid) >= cible) haut = mid;
      else bas = mid;
    }
    if (haut < meilleureNorme) {
      meilleureNorme = haut;
      meilleurX = ux * haut;
      meilleurY = uy * haut;
    }
  }

  const x = meilleureNorme === Infinity ? secoursX : meilleurX;
  const y = meilleureNorme === Infinity ? secoursY : meilleurY;
  return { x: +(x / R).toFixed(6), y: +(y / R).toFixed(6) };
}

/**
 * The face to fit: the expression's on `baseFace` states. One entry per
 * expression, because no single offset fits them all: on a narrow body one
 * face wants to go down and another up.
 */
function visageDe(def: StateDef, pose: Pose, expr: BotExpression | null): Visage {
  if (def.baseFace && expr) return { gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
  return { gaze: pose.gaze, split: pose.split, eyes: pose.eyes };
}

/** Times to sample a state at: one if nothing the solver reads ever moves. */
function dates(def: StateDef): number[] {
  const signature = (p: Pose) =>
    JSON.stringify([p.gaze, p.split, p.eyes, p.sil.rot, p.sil.cx, p.sil.cy, p.sil.sx, p.sil.sy]);
  if (signature(def.pose(0)) === signature(def.pose(def.duration))) return [0];
  const n = 3;
  return Array.from({ length: n }, (_, i) => (i / (n - 1)) * def.duration);
}

function decalagePour(
  def: StateDef,
  radii: number[],
  expr: BotExpression | null,
): { x: number; y: number } {
  const epreuves: Epreuve[] = [];
  for (const t of dates(def)) {
    const pose = def.pose(t);
    const contour = toPoints({ ...pose.sil, radii }, R);
    const calContour = toPoints(pose.sil, R);
    const v = visageDe(def, pose, expr);
    // The drift envelope's four corners bound the nominal pose at their centre.
    const coins: Visage[] = [];
    for (const dy of [-DERIVE_YAW, DERIVE_YAW]) {
      for (const dp of [-DERIVE_PITCH, DERIVE_PITCH]) {
        coins.push({
          ...v,
          gaze: { yaw: v.gaze.yaw + dy, pitch: v.gaze.pitch + dp, roll: v.gaze.roll },
        });
      }
    }
    for (const c of coins) {
      epreuves.push({
        empreintes: empreintes(c, pose.sil, radii),
        reference: empreintes(c, pose.sil, pose.sil.radii),
        contour,
        calContour,
      });
    }
  }
  return resous(epreuves, bonusPour(radii));
}

const NUL = { x: 0, y: 0 } as const;

const clef = (state: StateId, expr: string | null) => `${state}|${expr ?? ""}`;

/**
 * One entry per (shape, `baseBody` state, expression when the state takes one),
 * keyed by the radii array's identity, like the engine's own setters.
 */
function batir(): Map<number[], Map<string, { x: number; y: number }>> {
  return new Map(
    SHAPES.map((forme) => {
      const par = new Map<string, { x: number; y: number }>();
      for (const def of STATES) {
        if (!def.baseBody) continue;
        const expressions = def.baseFace ? [null, ...EXPRESSIONS] : [null];
        for (const expr of expressions) {
          par.set(clef(def.id, expr?.id ?? null), decalagePour(def, forme.radii, expr));
        }
      }
      return [forme.radii, par];
    }),
  );
}

const DECALAGES = batir();

/**
 * The offset for both eyes, in ball radii. Zero for an unknown profile or
 * `null`; on the circle both profiles match, so it is zero there too.
 */
export function eyeOffset(
  radii: number[] | null,
  state: StateId,
  expr: string | null,
): { x: number; y: number } {
  if (!radii) return NUL;
  const par = DECALAGES.get(radii);
  if (!par) return NUL;
  return par.get(clef(state, expr)) ?? par.get(clef(state, null)) ?? NUL;
}
