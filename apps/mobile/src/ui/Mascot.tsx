/* oxlint-disable react/no-array-index-key -- the engine emits a frame's dots, eyes and stops in a fixed order, so the index is the identity. */
import { useEffect, useState } from "react";
import { AccessibilityInfo, AppState, Pressable } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Mask, Path, Stop } from "react-native-svg";
import type { BotFrame } from "../../../renderer/src/mascot/bot/engine";
import { DEMI_VIEWBOX, RAYON } from "../../../renderer/src/mascot/bot/repere";
import type { MotionEnvironment } from "../../../renderer/src/mascot/motion";
import { MascotPlayer } from "../../../renderer/src/mascot/player";
import { colors } from "../colors";

let reduced = false;
void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
  reduced = value;
});

const nativeMotion: MotionEnvironment = {
  reducedMotion: () => reduced,
  hidden: () => AppState.currentState !== "active",
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  subscribe: (listener) => {
    const app = AppState.addEventListener("change", listener);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      reduced = value;
      listener();
    });
    return () => {
      app.remove();
      motion.remove();
    };
  },
};

// Desktop's engine and player; only the painting differs, SVG here instead of a canvas.
const player = new MascotPlayer(nativeMotion, { state: "inkling-drift", expression: "neutre" });
const view = `${-DEMI_VIEWBOX} ${-DEMI_VIEWBOX} ${DEMI_VIEWBOX * 2} ${DEMI_VIEWBOX * 2}`;

function Figure({ frame }: { frame: BotFrame }) {
  const ink = colors.mascot;
  const dots = frame.dots.map((dot, i) =>
    dot.d ? (
      <Path
        key={i}
        d={dot.d}
        fill={dot.color ?? ink}
        opacity={dot.opacity}
        transform={`translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`}
      />
    ) : (
      <Circle
        key={i}
        cx={dot.x}
        cy={dot.y}
        r={dot.r}
        fill={dot.color ?? ink}
        opacity={dot.opacity}
      />
    ),
  );
  const arcs = (side: "back" | "front") =>
    frame.arcs.map((arc) => (
      <Path
        key={`${side}${arc.id}`}
        d={arc[side]}
        stroke={`url(#arc${arc.id})`}
        strokeWidth={arc.width}
        strokeLinecap="round"
        fill="none"
        opacity={arc.opacity}
      />
    ));
  return (
    <>
      <Defs>
        {/* The eyes and the notch are holes through the body, as on desktop. */}
        <Mask id="body" maskUnits="userSpaceOnUse">
          <Path d={frame.bodyPath} fill="white" />
          {frame.eyes.map((eye, i) => (
            <Path key={i} d={eye.d} transform={eye.matrix} fill="black" fillOpacity={eye.alpha} />
          ))}
          {frame.notch ? (
            <Circle cx={frame.notch.x} cy={frame.notch.y} r={frame.notch.r} fill="black" />
          ) : null}
        </Mask>
        {frame.arcs.map((arc) => (
          <LinearGradient
            key={arc.id}
            id={`arc${arc.id}`}
            gradientUnits="userSpaceOnUse"
            x1={arc.grad.x1}
            y1={arc.grad.y1}
            x2={arc.grad.x2}
            y2={arc.grad.y2}
          >
            {arc.grad.stops.map((stop, i) => (
              <Stop key={i} offset={i / Math.max(1, arc.grad.stops.length - 1)} stopColor={stop} />
            ))}
          </LinearGradient>
        ))}
      </Defs>
      {arcs("back")}
      {frame.dotsBehind ? dots : null}
      <G mask="url(#body)" opacity={frame.bodyAlpha}>
        <Path d={frame.bodyPath} fill={ink} />
      </G>
      {frame.dotsBehind ? null : dots}
      {frame.notif ? (
        <Circle
          cx={frame.notif.x}
          cy={frame.notif.y}
          r={frame.notif.r}
          fill={colors.mascotNotification}
        />
      ) : null}
      {arcs("front")}
    </>
  );
}

/** Desktop's ink-blot mascot for the sidebar. It moves only while `visible`; a tap wakes it. */
export function Mascot({ size, visible }: { size: number; visible: boolean }) {
  const [frame, setFrame] = useState(() => player.current);
  useEffect(() => {
    const painter = player.attach(setFrame);
    painter.setVisible(visible);
    return painter.detach;
  }, [visible]);
  return (
    <Pressable
      accessibilityElementsHidden
      importantForAccessibility="no"
      onPress={() => player.wake()}
    >
      <Svg width={size} height={size} viewBox={view}>
        <Figure frame={frame} />
      </Svg>
    </Pressable>
  );
}
