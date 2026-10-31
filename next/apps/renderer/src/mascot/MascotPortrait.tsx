import * as stylex from "@stylexjs/stylex";
import { mascotColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useState } from "react";
import type { BotExpression } from "./bot/expressions";
import { drawFigure } from "./draw.ts";
import { browserMotion } from "./motion.ts";
import { MascotPlayer } from "./player.ts";
import { useMascotCanvas } from "./useMascotCanvas.ts";

/** How much the eyes still wander while they hold a look, so they stay alive. */
const HELD_LOOK_WANDER = 0.35;
const paint = {
  ink: mascotColor.portraitInk,
  paper: mascotColor.portraitPaper,
  notification: mascotColor.notification,
};

/**
 * A large, dark-on-paper mascot with its own engine, for the welcome screens,
 * so the sidebar mascot keeps its clock and its mood. It drifts with an
 * expression on, and holds its head turned toward `look` (degrees, positive
 * yaw is right, positive pitch is up) through every expression.
 */
export function MascotPortrait({
  size,
  expression,
  look,
  speed = 1,
}: {
  size: number;
  expression: BotExpression["id"];
  look: { yaw: number; pitch: number };
  speed?: number;
}) {
  const [player] = useState(
    () =>
      new MascotPlayer(
        browserMotion,
        { state: "inkling-drift-faced", expression },
        { speed, look: { ...look, mix: 1, wander: HELD_LOOK_WANDER } },
      ),
  );
  useEffect(
    () => player.setPose({ state: "inkling-drift-faced", expression }),
    [player, expression],
  );
  useEffect(() => player.setSpeed(speed), [player, speed]);
  const { yaw, pitch } = look;
  useEffect(
    () => player.setLook({ yaw, pitch, mix: 1, wander: HELD_LOOK_WANDER }),
    [player, yaw, pitch],
  );
  const ref = useMascotCanvas(player, size, size, true, (ctx, layer, frame) =>
    drawFigure(ctx, layer, frame, paint),
  );
  return <canvas ref={ref} aria-hidden="true" {...stylex.props(styles.canvas(size))} />;
}

const styles = stylex.create({
  canvas: (size: number) => ({ display: "block", width: size, height: size }),
});
