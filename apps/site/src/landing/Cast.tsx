import * as stylex from "@stylexjs/stylex";
import { landingColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useRef } from "react";
import { browserMotion } from "../../../renderer/src/mascot/motion.ts";
import { MascotPlayer, type MascotPose } from "../../../renderer/src/mascot/player.ts";
import { media } from "./landing.stylex.ts";

type Face = MascotPose["expression"];

const member = (face: Face, play: Face, speed: number, gaze: number) => ({
  face,
  play,
  speed,
  gaze,
});

// Each character wears one of the app's expressions, and `play` while hovered.
const cast = [
  member("neutre", "excite", 2.2, 1.1),
  member("attentif", "surpris", 1.8, 0.55),
  member("surpris", "excite", 2.4, 0.8),
  member("mefiant", "surpris", 2, 0.65),
  member("heureux", "excite", 1.9, 0.8),
  member("excite", "surpris", 2.4, 1.25),
  member("curieux", "excite", 1.6, 0.35),
  member("confus", "surpris", 2.1, 0.7),
  member("timide", "excite", 2, 0.9),
  member("blase", "surpris", 1.7, 0.4),
  member("somnolent", "surpris", 1.9, 0.7),
  member("excite", "surpris", 2.3, 0.9),
  member("neutre", "excite", 2.1, 0.65),
];

const STATE = "inkling-drift-faced";
const LOOK_YAW = 20;
const HOVER_SPEED = 1.6;

// One of the app's engines per character, so the first render can read its frame.
const players: MascotPlayer[] = [];
const playerFor = (index: number, gaze: "left" | "right") => {
  const c = cast[index % cast.length]!;
  const yaw = (gaze === "left" ? -LOOK_YAW : LOOK_YAW) * c.gaze;
  return (players[index] ??= new MascotPlayer(
    browserMotion,
    { state: STATE, expression: c.face },
    { speed: c.speed, look: { yaw, pitch: 6, mix: 1, wander: 1 } },
  ));
};

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
  const player = playerFor(index, gaze);
  const art = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const paths = art.current?.querySelectorAll("path");
    if (!paths || !alive) return;
    const [body, ...eyes] = paths;
    const attachment = player.attach(
      (frame) => {
        body?.setAttribute("d", frame.bodyPath);
        for (const [i, path] of eyes.entries()) {
          const eye = frame.eyes[i];
          path.setAttribute("opacity", String(eye?.alpha ?? 0));
          if (!eye) continue;
          path.setAttribute("d", eye.d);
          path.setAttribute("transform", eye.matrix);
        }
      },
      { live: true },
    );
    attachment.setVisible(true);
    return attachment.detach;
  }, [player, alive]);
  const excited = alive && engaged;
  useEffect(() => {
    player.setPose({ state: STATE, expression: excited ? c.play : c.face });
    player.setSpeed(c.speed * (excited ? HOVER_SPEED : 1));
  }, [player, c, excited]);
  const frame = player.current;
  return (
    <svg
      ref={art}
      viewBox="-110 -110 220 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      {...stylex.props(styles.art, engaged && styles.hopped)}
    >
      <path d={frame.bodyPath} fill="currentColor" />
      {[0, 1].map((i) => {
        const eye = frame.eyes[i];
        return (
          <path
            key={i}
            d={eye?.d}
            transform={eye?.matrix}
            opacity={eye?.alpha ?? 0}
            {...stylex.props(onSheet ? styles.pupilOnSheet : styles.pupil)}
          />
        );
      })}
    </svg>
  );
}

const styles = stylex.create({
  art: {
    display: "block",
    width: "100%",
    height: "100%",
    overflow: "visible",
    transitionProperty: "transform",
    transitionDuration: { default: "0.32s", [media.reduced]: "0s" },
    transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  hopped: { transform: "translateY(-4px) scale(1.05)" },
  pupil: { fill: landingColor.paper },
  pupilOnSheet: { fill: landingColor.sheet },
});
