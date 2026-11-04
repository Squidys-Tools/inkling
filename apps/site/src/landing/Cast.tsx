import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { inklingBody } from "./identity.ts";
import { media } from "./landing.stylex.ts";

type Eye =
  | { kind: "pill"; h: number; w: number; a: number; y: number }
  | { kind: "arc"; w: number; a: number; y: number; bend: number };

const pill = (h: number, w = 21, a = 0, y = 12): Eye => ({ kind: "pill", h, w, a, y });
const arc = (a = 0, y = 13, bend = -14): Eye => ({ kind: "arc", w: 24, a, y, bend });

const cast = [
  { gap: 24, eyes: [pill(45, 20, 21, 9), pill(59, 22, 8, 4)], duration: 5.7, gaze: 1.1 },
  { gap: 24, eyes: [arc(-9, 15, -15), arc(9, 15, -15)], duration: 7.1, gaze: 0.55 },
  { gap: 26, eyes: [pill(61, 29, -6, 5), pill(61, 29, 6, 5)], duration: 4.8, gaze: 0.8 },
  { gap: 23, eyes: [pill(35, 24, -15, 13), pill(43, 20, 9, 9)], duration: 6.3, gaze: 0.65 },
  { gap: 23, eyes: [pill(53, 23, 33, 14), pill(13, 19, -28, 14)], duration: 6.7, gaze: 0.8 },
  { gap: 25, eyes: [pill(49, 18, -8, 8), pill(58, 21, -8, 3)], duration: 4.9, gaze: 1.25 },
  { gap: 24, eyes: [arc(-9, 23, 8), arc(9, 23, 8)], duration: 8.2, gaze: 0.35 },
  { gap: 27, eyes: [arc(-12, 11, -20), pill(43, 24, 14, 8)], duration: 5.3, gaze: 0.7 },
  { gap: 23, eyes: [pill(58, 24, 27, 10), pill(51, 22, 27, 16)], duration: 5.8, gaze: 0.9 },
  { gap: 23, eyes: [pill(20, 28, -9, 24), pill(25, 27, 9, 23)], duration: 7.7, gaze: 0.4 },
  { gap: 25, eyes: [pill(12, 23, 0, 14), arc(9, 14, -16)], duration: 5.1, gaze: 0.7 },
  { gap: 25, eyes: [pill(57, 22, 15, 8), pill(39, 21, -9, 15)], duration: 6.1, gaze: 0.9 },
  { gap: 25, eyes: [pill(38, 23, -12, 13), arc(-8, 15, -12)], duration: 4.4, gaze: 0.65 },
];

export function Cast({
  index,
  gaze,
  alive = false,
  engaged = false,
  onSheet = false,
}: {
  index: number;
  gaze: "left" | "right";
  alive?: boolean;
  engaged?: boolean;
  onSheet?: boolean;
}) {
  const c = cast[index % cast.length]!;
  const dx = (gaze === "left" ? -15 : 15) * c.gaze;
  return (
    <svg
      viewBox="-110 -110 220 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      {...stylex.props(styles.art)}
    >
      <path d={inklingBody} fill="currentColor" />
      <g
        {...stylex.props(
          styles.gaze(`${dx}px`, String(c.gaze)),
          alive && styles.drift(`${c.duration * 1.23}s`, `${-index * 0.57}s`),
        )}
      >
        {c.eyes.map((eye, i) => {
          const x = i ? c.gap : -c.gap;
          return (
            <g key={`${eye.kind}-${eye.a}-${eye.y}`} transform={`rotate(${eye.a} ${x} ${eye.y})`}>
              <g
                {...stylex.props(
                  styles.eye,
                  alive && styles.blink(`${c.duration}s`, `${-index * 0.43}s`),
                )}
              >
                <g {...stylex.props(styles.eye, styles.lift, engaged && styles.lifted)}>
                  {eye.kind === "arc" ? (
                    <path
                      d={`M${x - eye.w / 2} ${eye.y} Q${x} ${eye.y + eye.bend} ${x + eye.w / 2} ${eye.y}`}
                      fill="none"
                      strokeWidth="9"
                      strokeLinecap="round"
                      {...stylex.props(onSheet ? styles.lineOnSheet : styles.line)}
                    />
                  ) : (
                    <rect
                      x={x - eye.w / 2}
                      y={eye.y - eye.h / 2}
                      width={eye.w}
                      height={eye.h}
                      rx={eye.w / 2}
                      {...stylex.props(onSheet ? styles.pupilOnSheet : styles.pupil)}
                    />
                  )}
                </g>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

const ease = "ease-in-out";

const drift = stylex.keyframes({
  "0%": { transform: "translate(var(--cast-x), 0)" },
  "33.333%": { transform: "translate(calc(var(--cast-x) + 3px * var(--cast-sway)), -2px)" },
  "66.667%": { transform: "translate(calc(var(--cast-x) - 2px * var(--cast-sway)), 1px)" },
  "100%": { transform: "translate(var(--cast-x), 0)" },
});

const blink = stylex.keyframes({
  "0%": { transform: "scaleY(1)" },
  "68%": { transform: "scaleY(1)" },
  "71%": { transform: "scaleY(0.12)" },
  "74.5%": { transform: "scaleY(1)" },
  "100%": { transform: "scaleY(1)" },
});

const styles = stylex.create({
  art: { display: "block", width: "100%", height: "100%", overflow: "visible" },
  gaze: (x: string, sway: string) => ({
    "--cast-x": x,
    "--cast-sway": sway,
    transform: "translate(var(--cast-x), 0)",
  }),
  drift: (duration: string, delay: string) => ({
    animationName: drift,
    animationDuration: duration,
    animationDelay: delay,
    animationTimingFunction: ease,
    animationIterationCount: "infinite",
  }),
  // Blinks and lifts scale about each eye's own box, as motion did for SVG.
  eye: { transformBox: "fill-box", transformOrigin: "center" },
  blink: (duration: string, delay: string) => ({
    animationName: blink,
    animationDuration: duration,
    animationDelay: delay,
    animationTimingFunction: ease,
    animationIterationCount: "infinite",
  }),
  lift: {
    transitionProperty: "transform",
    transitionDuration: { default: "0.18s", [media.reduced]: "0s" },
    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
  lifted: { transform: "translateY(-3px)" },
  pupil: { fill: landingColor.paper },
  pupilOnSheet: { fill: landingColor.sheet },
  line: { stroke: landingColor.paper },
  lineOnSheet: { stroke: landingColor.sheet },
});
