import * as React from "react";
import { motion } from "motion/react";
import { inklingBody } from "./identity";
// Same body, genuinely different faces. Eye sizes, lid gestures and angles are
// authored per character rather than stretching one expression across the cast.
const pill = (h, w = 21, a = 0, y = 12) => ({ kind: "pill", h, w, a, y });
const arc = (a = 0, y = 13, bend = -14) => ({ kind: "arc", w: 24, h: 14, a, y, bend });
export const cast = [
  {
    name: "Pip",
    gap: 24,
    eyes: [pill(45, 20, 21, 9), pill(59, 22, 8, 4)],
    duration: 5.7,
    gaze: 1.1,
  },
  { name: "Moss", gap: 24, eyes: [arc(-9, 15, -15), arc(9, 15, -15)], duration: 7.1, gaze: 0.55 },
  {
    name: "Dot",
    gap: 26,
    eyes: [pill(61, 29, -6, 5), pill(61, 29, 6, 5)],
    duration: 4.8,
    gaze: 0.8,
  },
  {
    name: "Bram",
    gap: 23,
    eyes: [pill(35, 24, -15, 13), pill(43, 20, 9, 9)],
    duration: 6.3,
    gaze: 0.65,
  },
  {
    name: "Fig",
    gap: 23,
    eyes: [pill(53, 23, 33, 14), pill(13, 19, -28, 14)],
    duration: 6.7,
    gaze: 0.8,
  },
  {
    name: "Scout",
    gap: 25,
    eyes: [pill(49, 18, -8, 8), pill(58, 21, -8, 3)],
    duration: 4.9,
    gaze: 1.25,
  },
  { name: "Nook", gap: 24, eyes: [arc(-9, 23, 8), arc(9, 23, 8)], duration: 8.2, gaze: 0.35 },
  {
    name: "Mallow",
    gap: 27,
    eyes: [arc(-12, 11, -20), pill(43, 24, 14, 8)],
    duration: 5.3,
    gaze: 0.7,
  },
  {
    name: "Bean",
    gap: 23,
    eyes: [pill(58, 24, 27, 10), pill(51, 22, 27, 16)],
    duration: 5.8,
    gaze: 0.9,
  },
  {
    name: "Pebble",
    gap: 23,
    eyes: [pill(20, 28, -9, 24), pill(25, 27, 9, 23)],
    duration: 7.7,
    gaze: 0.4,
  },
  {
    name: "Bloom",
    gap: 25,
    eyes: [pill(12, 23, 0, 14), arc(9, 14, -16)],
    duration: 5.1,
    gaze: 0.7,
  },
  {
    name: "Reed",
    gap: 25,
    eyes: [pill(57, 22, 15, 8), pill(39, 21, -9, 15)],
    duration: 6.1,
    gaze: 0.9,
  },
  {
    name: "Wisp",
    gap: 25,
    eyes: [pill(38, 23, -12, 13), arc(-8, 15, -12)],
    duration: 4.4,
    gaze: 0.65,
  },
];
export function Cast({ index = 0, gaze = "left", alive = false, engaged = false }) {
  const c = cast[index % cast.length],
    dx = (gaze === "left" ? -15 : gaze === "right" ? 15 : 0) * c.gaze,
    dy = gaze === "up" ? -14 : gaze === "down" ? 9 : 0;
  const timing = {
    duration: c.duration,
    repeat: Infinity,
    delay: -(index * 0.43),
    times: [0, 0.68, 0.71, 0.745, 1],
    ease: "easeInOut",
  };
  return (
    <svg
      className="cast-art"
      viewBox="-110 -110 220 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      data-cast-name={c.name}
      data-expression={c.name.toLowerCase()}
    >
      <path d={inklingBody} fill="currentColor" />
      <motion.g
        animate={
          alive
            ? { x: [dx, dx + 3 * c.gaze, dx - 2 * c.gaze, dx], y: [dy, dy - 2, dy + 1, dy] }
            : { x: dx, y: dy }
        }
        transition={{
          duration: c.duration * 1.23,
          repeat: Infinity,
          delay: -index * 0.57,
          ease: "easeInOut",
        }}
      >
        {c.eyes.map((eye, i) => {
          const x = i ? c.gap : -c.gap;
          return (
            <g key={`${eye.kind}-${eye.a}-${eye.h}`} transform={`rotate(${eye.a} ${x} ${eye.y})`}>
              <motion.g
                style={{ transformOrigin: `${x}px ${eye.y}px` }}
                animate={{ scaleY: alive ? [1, 1, 0.12, 1, 1] : 1 }}
                transition={timing}
              >
                <motion.g
                  style={{ transformOrigin: `${x}px ${eye.y}px` }}
                  animate={{ y: engaged ? -3 : 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {eye.kind === "arc" ? (
                    <path
                      d={`M${x - eye.w / 2} ${eye.y} Q${x} ${eye.y + eye.bend} ${x + eye.w / 2} ${eye.y}`}
                      className="cast-eye-line"
                      fill="none"
                      strokeWidth="9"
                      strokeLinecap="round"
                    />
                  ) : (
                    <rect
                      x={x - eye.w / 2}
                      y={eye.y - eye.h / 2}
                      width={eye.w}
                      height={eye.h}
                      rx={eye.w / 2}
                      className="cast-eye"
                    />
                  )}
                </motion.g>
              </motion.g>
            </g>
          );
        })}
      </motion.g>
    </svg>
  );
}
