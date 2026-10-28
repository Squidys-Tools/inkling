import { useEffect, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, DEFAULT_EXPRESSION } from "./bot/expressions";
import { COLOR_BY_ID, SHAPE_BY_ID, DEFAULT_SHAPE } from "./bot/skins";
import { RAYON } from "./bot/repere";
import { STATE_BY_ID, type StateId } from "./bot/states";
import { MascotFigure } from "./MascotFigure";

export type { StateId };

export interface InklingMascotProps {
  size?: number;
  shape?: string;
  color?: string;
  /** Body color as any CSS color, overriding `color` when a skin hex will not do. */
  ink?: string;
  expression?: string;
  paper?: string;
  /** Freeze on one exact frame (seconds into the state). No animation loop. */
  frozenAt?: number;
  state?: StateId;
  /** Play the state live (breathing, blinking, gaze drift). Ignored when frozenAt is set. */
  playing?: boolean;
  /**
   * Hold the head turned toward a fixed direction, in degrees (positive yaw =
   * right, positive pitch = up). It replaces the gaze of every expression, so
   * the face can change mood while the eyes keep looking at the same spot. A
   * little drift stays, so the eyes still feel alive.
   */
  look?: { yaw: number; pitch: number };
  /**
   * Playback rate of the live animation (1 = normal, 0.5 = half speed). It scales
   * the clock, so breathing, drift, blinks and morphs all slow together.
   */
  speed?: number;
}

const HELD_LOOK_WANDER = 0.35;

const heldLook = (look: { yaw: number; pitch: number }) => ({
  ...look,
  mix: 1,
  spin: 0,
  wander: HELD_LOOK_WANDER,
});

/**
 * Self-contained mascot: owns its engine and animation loop. Used by the
 * dev board (?mascot) and frozen-frame renders. The live app slots share one
 * engine through mascotStore instead, so the mascot can move between slots
 * without resetting its clock.
 */
export function InklingMascot({
  size = 80,
  shape = "inkling-splash",
  color = "inkling",
  ink: inkOverride,
  expression = DEFAULT_EXPRESSION,
  paper = "#faf9f6",
  frozenAt,
  state = "idle",
  playing = true,
  look,
  speed = 1,
}: InklingMascotProps) {
  const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? SHAPE_BY_ID.get(DEFAULT_SHAPE)?.radii ?? null;
  const ink = inkOverride ?? COLOR_BY_ID.get(color)?.hex ?? "#1a1a1a";
  const expr = EXPRESSION_BY_ID.get(expression) ?? null;

  const [engine] = useState(() => {
    const created = new BotEngine(RAYON, state, shapeRadii, expr);
    // Dated before the clock starts so the very first frame already looks there.
    if (look) created.setLook(heldLook(look), -10);
    return created;
  });
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0));
  // Running clock, shared with the transition setters below. Dating a change
  // at a stale time (e.g. always 0) completes its morph instantly and reads
  // as a hard cut — this ref is what keeps shape/state/expression gliding.
  const clockRef = useRef(0);

  useEffect(() => {
    engine.setShape(shapeRadii, clockRef.current);
    engine.setExpression(expr, clockRef.current);
    // oxlint-disable-next-line react/set-state-in-effect -- re-samples the mutable BotEngine after setShape/setExpression change it.
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, shapeRadii, expr, frozenAt]);

  const lookYaw = look?.yaw;
  const lookPitch = look?.pitch;
  useEffect(() => {
    if (lookYaw === undefined || lookPitch === undefined) engine.setLook(null, clockRef.current);
    else engine.setLook(heldLook({ yaw: lookYaw, pitch: lookPitch }), clockRef.current);
  }, [engine, lookYaw, lookPitch]);

  useEffect(() => {
    if (engine.state !== state) engine.setState(state, clockRef.current);
    // oxlint-disable-next-line react/set-state-in-effect -- re-samples the mutable BotEngine after setState changes it.
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, state, frozenAt]);

  useEffect(() => {
    if (frozenAt !== undefined || !playing) return;
    let raf = 0;
    let last = 0;
    let clock = 0;
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0;
      last = ms;
      clock += dt * speed;
      clockRef.current = clock;
      setFrame(engine.sample(clock));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, frozenAt, playing, speed]);

  return <MascotFigure frame={frame} size={size} ink={ink} paper={paper} />;
}

export function isKnownMascotState(value: string): value is StateId {
  return STATE_BY_ID.has(value as StateId);
}
