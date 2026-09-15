import { useId } from "react";
import { DEMI_VIEWBOX, RAYON } from "./bot/repere";
import { mixHex } from "./bot/skins";
import type { BotFrame } from "./bot/engine";

export interface MascotFigureProps {
  frame: BotFrame;
  size: number;
  ink?: string;
  /** Eye color. Transparent keeps the old logo's see-through eyes on any theme. */
  paper?: string;
  className?: string;
}
/**
 * Pure SVG renderer for a sampled bot frame. Same recipe as bloub's
 * BloubBot.vue: eyes are holes cut in a <mask> (never white shapes on top),
 * backed by a paper-colored path so decor drawn behind the body cannot show
 * through the eyes.
 */
export function MascotFigure({ frame, size, ink = "#1a1a1a", paper = "#faf9f6", className }: MascotFigureProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const maskId = `inkling-mask-${uid}`;
  const VB = DEMI_VIEWBOX;

  const dotFill = (dot: BotFrame["dots"][number]) => {
    if (dot.color) return dot.color;
    return dot.depth === undefined ? ink : mixHex(paper === "transparent" ? ink : paper, ink, dot.depth);
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      role="img"
      aria-label="inkling mascot"
      className={className}
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
                fill={dotFill(dot)}
                opacity={dot.opacity}
              />
            ) : (
              <circle
                key={`pb${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotFill(dot)}
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
                fill={dotFill(dot)}
                opacity={dot.opacity}
              />
            ) : (
              <circle
                key={`pf${i}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dotFill(dot)}
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

/**
 * Eyes only, custom fit for the search field.
 * The generic MascotEyes uses a tall crop (-60 -80 150 135) that reserves
 * room for the full motion range across all states. In a 50px search bar
 * that empty space reads as a vertical offset, eyes pinned high with dead
 * space below. This uses a tight crop around the drift + attentif/curieux
 * eye centroid (about 25, -50) so the gaze sits optically centered.
 */
const SEARCH_EYES_VIEWBOX = "-14 -88 78 80";

export function MascotSearchEyes({
  frame,
  size,
  ink = "#e5ddd2",
  className,
}: {
  frame: BotFrame;
  size: number;
  ink?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={(size * 80) / 78}
      viewBox={SEARCH_EYES_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="inkling mascot eyes"
      className={className}
    >
      {frame.eyes.map((eye, i) => (
        <path key={i} d={eye.d} transform={eye.matrix} opacity={eye.alpha} fill={ink} />
      ))}
    </svg>
  );
}
