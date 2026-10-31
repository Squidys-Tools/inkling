import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";
import type { BotExpression } from "../mascot/bot/expressions";
import { MascotPortrait } from "../mascot/MascotPortrait.tsx";

const FACE_HOLD_MS = 3400;

/**
 * The large, cropped mascot on the first and last welcome screens. It drifts,
 * blinks and wanders through a few calm faces, with its own engine so the
 * sidebar mascot keeps its clock and its mood.
 */
export function WelcomeMascot({
  size,
  faces,
  look,
  speed,
  side,
  leaving,
  reducedMotion,
}: {
  size: number;
  faces: readonly BotExpression["id"][];
  /** Where the eyes stay pointed (toward the screen's text) through every face. */
  look: { yaw: number; pitch: number };
  /** Playback rate of the animation and the face changes (1 = normal). */
  speed: number;
  /** Which bottom corner it hangs off; it rises in from, and sinks back toward, that corner. */
  side: "left" | "right";
  /** Set while the screen plays its exit. */
  leaving: boolean;
  reducedMotion: boolean;
}) {
  const [faceIndex, setFaceIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(
      () => setFaceIndex((index) => (index + 1) % faces.length),
      FACE_HOLD_MS / speed,
    );
    return () => window.clearInterval(timer);
  }, [faces, reducedMotion, speed]);

  // Its centre sits 0.2 of its size in from the container's side and bottom edges.
  const offset = -0.3 * size;
  return (
    <div
      aria-hidden="true"
      {...stylex.props(
        styles.corner,
        side === "right" ? styles.right(offset) : styles.left(offset),
        side === "right" ? styles.inFromRight : styles.inFromLeft,
        leaving && (side === "right" ? styles.outToRight : styles.outToLeft),
      )}
    >
      <MascotPortrait
        size={size}
        expression={faces[faceIndex] ?? "neutre"}
        look={look}
        speed={speed}
      />
    </div>
  );
}

const reduced = "@media (prefers-reduced-motion: reduce)";
const riseFromRight = stylex.keyframes({ from: { opacity: 0, translate: "10% 16%" } });
const riseFromLeft = stylex.keyframes({ from: { opacity: 0, translate: "-10% 16%" } });
const sinkToRight = stylex.keyframes({ to: { opacity: 0, translate: "6% 10%" } });
const sinkToLeft = stylex.keyframes({ to: { opacity: 0, translate: "-6% 10%" } });

const styles = stylex.create({
  corner: {
    position: "absolute",
    lineHeight: 0,
    pointerEvents: "none",
    animationDuration: "1100ms",
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    animationFillMode: "both",
  },
  right: (offset: number) => ({ right: offset, bottom: offset }),
  left: (offset: number) => ({ left: offset, bottom: offset }),
  inFromRight: { animationName: { default: riseFromRight, [reduced]: "none" } },
  inFromLeft: { animationName: { default: riseFromLeft, [reduced]: "none" } },
  outToRight: {
    animationName: { default: sinkToRight, [reduced]: "none" },
    animationDuration: "320ms",
    animationTimingFunction: "cubic-bezier(0.55, 0, 0.75, 0.4)",
  },
  outToLeft: {
    animationName: { default: sinkToLeft, [reduced]: "none" },
    animationDuration: "320ms",
    animationTimingFunction: "cubic-bezier(0.55, 0, 0.75, 0.4)",
  },
});
