import * as stylex from "@stylexjs/stylex";
import { mascotColor } from "@inkling/ui/tokens.stylex";
import { useEffect } from "react";
import { drawEyes, drawFigure, EYES_VIEW } from "./draw.ts";
import { type MascotMood, poseFor } from "./mood.ts";
import { browserMotion, useReducedMotion } from "./motion.ts";
import { MascotPlayer } from "./player.ts";
import { useMascotCanvas } from "./useMascotCanvas.ts";

// One engine for the sidebar figure and the search field's eyes, so the two
// show the same moment and the mascot keeps its clock as it moves between them.
const live = new MascotPlayer(browserMotion, { state: "inkling-drift", expression: "neutre" });
const paint = { ink: mascotColor.body, paper: null, notification: mascotColor.notification };

/**
 * The live mascot for the sidebar header. Decorative: every mood also shows
 * elsewhere. Pass `visible={false}` while the sidebar is closed: a frame sliding
 * over it still counts as on screen to an IntersectionObserver.
 */
export function Mascot({
  mood,
  size = 44,
  visible = true,
}: {
  mood: MascotMood;
  size?: number;
  visible?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const { busy, face } = mood;
  useEffect(
    () => live.setPose(poseFor({ busy, face }, reducedMotion)),
    [busy, face, reducedMotion],
  );
  const ref = useMascotCanvas(live, size, size, visible, (ctx, layer, frame) =>
    drawFigure(ctx, layer, frame, paint),
  );
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      {...stylex.props(styles.canvas, styles.size(size, size))}
    />
  );
}

/** The live mascot's eyes, for the search field while it has focus. `bobbing` while the user types. */
export function MascotEyes({ size = 22, bobbing = false }: { size?: number; bobbing?: boolean }) {
  const height = (size * EYES_VIEW.height) / EYES_VIEW.width;
  const ref = useMascotCanvas(live, size, height, true, (ctx, _layer, frame) =>
    drawEyes(ctx, frame, mascotColor.body),
  );
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      {...stylex.props(styles.canvas, styles.size(size, height), bobbing && styles.bob)}
    />
  );
}

const bob = stylex.keyframes({
  "0%, 100%": { transform: "translateY(0)" },
  "50%": { transform: "translateY(-1.5px)" },
});

const styles = stylex.create({
  canvas: { display: "block", flexShrink: 0 },
  size: (width: number, height: number) => ({ width, height }),
  bob: {
    animationName: { default: bob, "@media (prefers-reduced-motion: reduce)": "none" },
    animationDuration: "0.9s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
});
