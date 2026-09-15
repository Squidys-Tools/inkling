import { useEffect, useMemo, useRef, useState } from "react";
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
  expression?: string;
  paper?: string;
  /** Freeze on one exact frame (seconds into the state). No animation loop. */
  frozenAt?: number;
  state?: StateId;
  /** Play the state live (breathing, blinking, gaze drift). Ignored when frozenAt is set. */
  playing?: boolean;
}

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
  expression = DEFAULT_EXPRESSION,
  paper = "#faf9f6",
  frozenAt,
  state = "idle",
  playing = true,
}: InklingMascotProps) {
  const shapeRadii = SHAPE_BY_ID.get(shape)?.radii ?? SHAPE_BY_ID.get(DEFAULT_SHAPE)?.radii ?? null;
  const ink = COLOR_BY_ID.get(color)?.hex ?? "#1a1a1a";
  const expr = EXPRESSION_BY_ID.get(expression) ?? null;

  const engine = useMemo(
    () => new BotEngine(RAYON, state, shapeRadii, expr),
    // Engine identity follows its initial conditions; transitions go through setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [frame, setFrame] = useState<BotFrame>(() => engine.sample(frozenAt ?? 0));
  // Running clock, shared with the transition setters below. Dating a change
  // at a stale time (e.g. always 0) completes its morph instantly and reads
  // as a hard cut — this ref is what keeps shape/state/expression gliding.
  const clockRef = useRef(0);

  useEffect(() => {
    engine.setShape(shapeRadii, clockRef.current);
    engine.setExpression(expr, clockRef.current);
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, shapeRadii, expr, frozenAt]);

  useEffect(() => {
    if (engine.state !== state) engine.setState(state, clockRef.current);
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
      clock += dt;
      clockRef.current = clock;
      setFrame(engine.sample(clock));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, frozenAt, playing]);

  return <MascotFigure frame={frame} size={size} ink={ink} paper={paper} />;
}

export function isKnownMascotState(value: string): value is StateId {
  return STATE_BY_ID.has(value as StateId);
}
