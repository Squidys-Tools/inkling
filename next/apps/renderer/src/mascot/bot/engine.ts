import { arcRender, type ArcRender, type DotRender } from "./decor";
import { blendExpression, type BotExpression } from "./expressions";
import { eyeOffset } from "./eyefit";
import { renderEyes, type RenderedEye } from "./eyes";
import { liveliness } from "./face";
import { LOOK_MORPH, NO_LOOK, lerpLook, type Look } from "./look";
import { clamp, easings, lerp } from "./math";
import { closedPath, radiusAtAngle, toPoints, type Point, type Silhouette } from "./shape";
import { blendPose, type Pose } from "./pose";
import { STATE_BY_ID, type StateDef, type StateId } from "./states";

export interface BotFrame {
  bodyPath: string;
  bodyAlpha: number;
  eyes: RenderedEye[];
  dots: DotRender[];
  /** Dots drawn behind the body, like `burst`'s particles. */
  dotsBehind: boolean;
  arcs: ArcRender[];
  notif: { x: number; y: number; r: number } | null;
  notch: { x: number; y: number; r: number } | null;
}

/**
 * A clock-free engine: `sample(t)` is a pure function of time, so pausing,
 * slowing or seeking renders the same frame. Outside state enters only through
 * the dated setters, never through a value `sample` reads.
 */
export class BotEngine {
  /** The resting ball's radius, in viewBox units. */
  private readonly scale: number;

  private cur: StateId;
  private prev: StateId | null = null;
  /** Set only when a state change lands mid-fade; see `setState`. */
  private frozenOrigin: Pose | null = null;
  private tCur = 0;
  private tPrev = 0;
  private blinkAt = -10;
  private pts: Point[] = [];
  private shape: number[] | null = null;
  private shapePrev: number[] | null = null;
  private shapeAt = -10;
  private expr: BotExpression | null = null;
  private exprPrev: BotExpression | null = null;
  private exprAt = -10;
  private look: Look = NO_LOOK;
  private lookPrev: Look = NO_LOOK;
  private lookAt = -10;

  /** Morph time for a shape or expression change. */
  static readonly SHAPE_MORPH = 0.45;

  constructor(
    scale: number,
    initial: StateId,
    shape: number[] | null,
    expression: BotExpression | null,
  ) {
    this.scale = scale;
    this.cur = initial;
    this.shape = shape;
    this.expr = expression;
  }

  setExpression(expression: BotExpression | null, now: number) {
    if (expression === this.expr) return;
    this.exprPrev = this.expr;
    this.expr = expression;
    this.exprAt = now;
  }

  private exprAtTime(now: number): BotExpression | null {
    const to = this.expr;
    const from = this.exprPrev;
    if (!to || !from) return to;
    const k = (now - this.exprAt) / BotEngine.SHAPE_MORPH;
    if (k >= 1) return to;
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)));
  }

  /** Replaces the body only on `baseBody` states; elsewhere the silhouette is the animation. */
  setShape(radii: number[] | null, now: number) {
    if (radii === this.shape) return;
    this.shapePrev = this.shape;
    this.shape = radii;
    this.shapeAt = now;
  }

  // `shapePrev` is kept after the morph so re-reading a past time still blends.
  private shapeAtTime(now: number): number[] | null {
    const to = this.shape;
    const from = this.shapePrev;
    if (!to || !from) return to;
    const k = (now - this.shapeAt) / BotEngine.SHAPE_MORPH;
    if (k >= 1) return to;
    const t = easings.easeOutQuint(clamp(k));
    return to.map((r, i) => lerp(from[i] ?? r, r, t));
  }

  /**
   * `null` returns to the state's own gaze. Unlike `setShape` it starts from the
   * current look, not the previous target: it runs on every pointer move, and
   * restarting from the old target would make the follow stutter.
   */
  setLook(look: Look | null, now: number) {
    // A NaN kept once would poison every later frame, so the last finite look stays.
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.wander)) {
      return;
    }
    this.lookPrev = this.lookAtTime(now);
    this.look = look ?? NO_LOOK;
    this.lookAt = now;
  }

  private lookAtTime(now: number): Look {
    const k = (now - this.lookAt) / LOOK_MORPH;
    if (k >= 1) return this.look;
    return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)));
  }

  private posed(
    def: StateDef,
    t: number,
    shape: number[] | null,
    expr: BotExpression | null,
  ): Pose {
    let pose = def.pose(t);
    if (def.baseBody && shape) {
      pose = { ...pose, sil: { ...pose.sil, radii: shape } };
    }
    if (def.baseFace && expr) {
      pose = { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes };
    }
    return pose;
  }

  /**
   * The eyefit offset for `state` at `now`, in ball radii. It is looked up at
   * both ends of each morph (`eyefit.ts` says why it is never solved per frame)
   * and blended on the same curve as the morph that causes it.
   */
  private eyeOffsetAt(now: number, state: StateId): { x: number; y: number } {
    const alongMorph = (
      start: number,
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      if (a === b) return b;
      const k = (now - start) / BotEngine.SHAPE_MORPH;
      if (k >= 1) return b;
      const t = easings.easeOutQuint(clamp(k));
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
    };
    const forShape = (radii: number[] | null) =>
      alongMorph(
        this.exprAt,
        eyeOffset(radii, state, this.exprPrev?.id ?? null),
        eyeOffset(radii, state, this.expr?.id ?? null),
      );
    return alongMorph(this.shapeAt, forShape(this.shapePrev), forShape(this.shape));
  }

  get state(): StateId {
    return this.cur;
  }

  /** Where the current fade starts: the frozen pose, or the left state still animating. */
  private fadeOrigin(now: number, shape: number[] | null, expr: BotExpression | null): Pose | null {
    if (this.frozenOrigin) return this.frozenOrigin;
    if (!this.prev) return null;
    const prevDef = STATE_BY_ID.get(this.prev)!;
    return this.posed(prevDef, Math.max(0, now - this.tPrev), shape, expr);
  }

  /** What `sample` blends at `now`, before liveliness and look. */
  private blendedPose(now: number): Pose {
    const def = STATE_BY_ID.get(this.cur)!;
    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    const pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
    const since = now - this.tCur;
    if (since >= def.morph) return pose;
    const origin = this.fadeOrigin(now, shape, expr);
    if (!origin) return pose;
    return blendPose(origin, pose, easings.easeOutQuint(clamp(since / def.morph)));
  }

  /**
   * The engine keeps one state of history, so a change that lands mid-fade
   * freezes the blended pose on screen and fades from it; fading from the left
   * state's full pose jumped. Only then: freezing on every change would stop
   * the left state's own motion (`alert`'s "!") for the whole fade.
   */
  setState(id: StateId, now: number) {
    if (id === this.cur) return;
    const morph = STATE_BY_ID.get(this.cur)!.morph;
    const midFade = this.prev !== null && now - this.tCur < morph;
    this.frozenOrigin = midFade ? this.blendedPose(now) : null;
    this.prev = this.cur;
    this.tPrev = this.tCur;
    this.cur = id;
    this.tCur = now;
    if (STATE_BY_ID.get(id)?.blinkIn) this.blinkAt = now;
  }

  sample(now: number): BotFrame {
    const R = this.scale;
    const def = STATE_BY_ID.get(this.cur)!;
    const shape = this.shapeAtTime(now);
    const expr = this.exprAtTime(now);
    let pose = this.posed(def, Math.max(0, now - this.tCur), shape, expr);
    let offset = this.eyeOffsetAt(now, this.cur);

    const since = now - this.tCur;
    // The left state is never purged, or re-reading a time inside its fade
    // would lose it and the engine would stop being replayable.
    const origin = since < def.morph ? this.fadeOrigin(now, shape, expr) : null;
    if (origin) {
      // Clamped: a time before the change gives a negative ratio, which the
      // ease-out extrapolates thirty times too far.
      const ratio = easings.easeOutQuint(clamp(since / def.morph));
      pose = blendPose(origin, pose, ratio);
      if (this.prev) {
        const before = this.eyeOffsetAt(now, this.prev);
        offset = {
          x: lerp(before.x, offset.x, ratio),
          y: lerp(before.y, offset.y, ratio),
        };
      }
    }

    const alive = pose.eyeAlpha > 0.01;
    const look = this.lookAtTime(now);
    const life = liveliness(now, { wander: alive ? look.wander : 0, blink: alive });

    const gaze = {
      // The look replaces the pose's aim; drift is added after the mix so it
      // survives a held look.
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      // Roll never follows the look: the measured -13deg head tilt is the character.
      roll: pose.gaze.roll + life.dRoll,
    };

    // A blink masks each `blinkIn` state change, on top of the blink calendar.
    const forced = clamp((now - this.blinkAt) / 0.2);
    const forcedLid = forced < 1 ? Math.abs(forced * 2 - 1) : 1;
    const lid = Math.min(life.lid, forcedLid);

    const offX = life.driftX;
    const offY = life.driftY;

    const sil: Silhouette = {
      ...pose.sil,
      cx: pose.sil.cx + offX,
      cy: pose.sil.cy + offY,
      sy: pose.sil.sy * life.breath,
    };
    const bodyPath = closedPath(toPoints(sil, R, this.pts));

    // Eyes and the notification dot sit on a unit sphere, scaled to the body's
    // radius in their direction. INKLING EXTENSION: `steadyFace` skips that, or
    // passing lobes would pump the eyes apart.
    const bodyRadius = (x: number, y: number) =>
      def.steadyFace ? 1 : radiusAtAngle(pose.sil.radii, Math.atan2(y, x) - pose.sil.rot);

    const eyes = renderEyes({
      pose,
      gaze,
      lid,
      bodyRadius,
      drift: { x: offX, y: offY },
      offset,
      steadyFace: def.steadyFace === true,
      R,
    });

    const dots = pose.dots
      .filter((p) => p.opacity > 0.01 && p.r > 0.0005)
      .map((p) => ({ ...p, x: (p.x + offX) * R, y: (p.y + offY) * R, r: p.r * R }));

    const nFit = pose.notif ? bodyRadius(pose.notif.x, pose.notif.y) : 1;
    const nx = pose.notif ? (pose.notif.x * nFit + offX) * R : 0;
    const ny = pose.notif ? (pose.notif.y * nFit + offY) * R : 0;
    const notif = pose.notif ? { x: nx, y: ny, r: pose.notif.r * R } : null;
    const notch = pose.notif ? { x: nx, y: ny, r: pose.notif.notch * R } : null;

    return {
      bodyPath,
      bodyAlpha: pose.bodyAlpha,
      eyes,
      dots,
      dotsBehind: pose.dotsBehind,
      arcs: pose.arcs
        .filter((a) => a.opacity > 0.01)
        .map((a) => arcRender(a.seed, a.t, R, a.id, a.opacity)),
      notif,
      notch,
    };
  }
}
