import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BotEngine, type BotFrame } from "./bot/engine";
import { EXPRESSION_BY_ID, DEFAULT_EXPRESSION } from "./bot/expressions";
import { COLOR_BY_ID, SHAPE_BY_ID, mixHex, DEFAULT_SHAPE } from "./bot/skins";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import { STATE_BY_ID, type StateId } from "./bot/states";

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

function dotFill(
  dot: BotFrame["dots"][number],
  ink: string,
  paper: string,
): string {
  if (dot.color) return dot.color;
  return dot.depth === undefined ? ink : mixHex(paper, ink, dot.depth);
}

/**
 * React port of bloub's BloubBot.vue render recipe: eyes are holes cut in a
 * <mask> (never white shapes on top), the body is backed by an opaque
 * paper-colored path so decor drawn behind it cannot show through the eyes.
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
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `inkling-mask-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);

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

  useEffect(() => {
    engine.setShape(shapeRadii, 0);
    engine.setExpression(expr, 0);
    if (frozenAt !== undefined) setFrame(engine.sample(frozenAt));
  }, [engine, shapeRadii, expr, frozenAt]);

  useEffect(() => {
    if (engine.state !== state) engine.setState(state, 0);
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
      setFrame(engine.sample(clock));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, frozenAt, playing]);

  const VB = DEMI_VIEWBOX;
  const frozenLabel = frozenAt !== undefined ? `frozen ${state}` : `${state}`;

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label={`inkling mascot, ${frozenLabel}`}
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={-VB}
          y={-VB}
          width={VB * 2}
          height={VB * 2}
        >
          <path d={frame.bodyPath} fill="#fff" />
          {frame.eyes.map((eye, i) => (
            <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill="#000" />
          ))}
          {frame.notch && (
            <circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="#000" />
          )}
        </mask>
        {frame.arcs.map((arc) => (
          <linearGradient
            key={arc.id}
            id={`${uid}-${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((c, i) => (
              <stop
                key={i}
                offset={i / (arc.grad.stops.length - 1)}
                stopColor={c}
              />
            ))}
          </linearGradient>
        ))}
      </defs>

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`b${arc.id}`}
            d={arc.back}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>

      {frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) =>
            dot.d ? (
              <path
                key={`pb${i}`}
                d={dot.d}
                transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
                fill={dotFill(dot, ink, paper)}
                opacity={dot.opacity}
              />
            ) : (
              <circle
                key={`pb${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotFill(dot, ink, paper)}
                opacity={dot.opacity}
              />
            ),
          )}
        </g>
      )}

      <g opacity={frame.bodyAlpha}>
        <path d={frame.bodyPath} fill={paper} />
        <g mask={`url(#${maskId})`}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill={ink} />
        </g>
      </g>

      {!frame.dotsBehind && (
        <g>
          {frame.dots.map((dot, i) =>
            dot.d ? (
              <path
                key={`pf${i}`}
                d={dot.d}
                transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
                fill={dotFill(dot, ink, paper)}
                opacity={dot.opacity}
              />
            ) : (
              <circle
                key={`pf${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotFill(dot, ink, paper)}
                opacity={dot.opacity}
              />
            ),
          )}
        </g>
      )}

      {frame.notif && (
        <circle cx={frame.notif.x} cy={frame.notif.y} r={frame.notif.r} fill="#3b93f0" />
      )}

      <g fill="none" strokeLinecap="round">
        {frame.arcs.map((arc) => (
          <path
            key={`f${arc.id}`}
            d={arc.front}
            stroke={`url(#${uid}-${arc.id})`}
            strokeWidth={arc.width}
            opacity={arc.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

export function isKnownMascotState(value: string): value is StateId {
  return STATE_BY_ID.has(value as StateId);
}
