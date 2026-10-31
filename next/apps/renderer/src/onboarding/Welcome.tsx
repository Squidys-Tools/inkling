import * as stylex from "@stylexjs/stylex";
import { color, font } from "@inkling/ui/tokens.stylex";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useReducedMotion } from "../mascot/motion.ts";
import { preloadOnboardingPhotos } from "./media.ts";
import { LAST_SCREEN, Screen } from "./screens.tsx";
import { stageScale } from "./stage.ts";
import { WelcomeMascot } from "./WelcomeMascot.tsx";

/**
 * Drawn size of the big cropped mascot at stage scale 1; the body is about 63%
 * of it. The body never shrinks below 0.237 of it, so the blob keeps bleeding
 * off both edges however it breathes and turns.
 */
const MASCOT_SIZE = 860;
/** Eyes stay turned toward each screen's text (positive yaw is right, positive pitch is up). */
const WELCOME_LOOK = { yaw: -15, pitch: 24 };
const FAREWELL_LOOK = { yaw: 26, pitch: 12 };
/** The big mascots run this much slower, so they stay calm beside the text. */
const MASCOT_SPEED = 0.55;
/** How long a screen takes to leave before the next one comes in; matches the stage's exit. */
const LEAVE_MS = 320;

const welcomeFaces = ["neutre", "curieux", "heureux", "attentif"] as const;
const farewellFaces = ["heureux", "neutre", "fier", "timide"] as const;

/**
 * The five welcome screens on a 960x540 stage that scales with the space it is
 * given. `onFinish` runs after the last screen, Skip or Escape.
 */
export function Welcome({ onFinish }: { onFinish: () => void }) {
  const reducedMotion = useReducedMotion();
  const [screen, setScreen] = useState(0);
  const [scale, setScale] = useState(1);
  /** Set while the current screen plays its exit: 1 forward, -1 back, 0 closing. */
  const [leaving, setLeaving] = useState<-1 | 0 | 1 | null>(null);
  /** Which way the last move went, so the next screen comes in from that side. */
  const [direction, setDirection] = useState<-1 | 1>(1);
  const rootRef = useRef<HTMLElement>(null);
  const leaveTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(stageScale(entry.contentRect.width, entry.contentRect.height));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // The later screens' photos decode while the first one shows, so none pop in.
  useEffect(preloadOnboardingPhotos, []);

  // Plays the current screen's exit, then lands on `next` or finishes.
  const go = (next: number | "close") => {
    if (leaving !== null) return;
    const step = next === "close" ? 0 : next > screen ? 1 : -1;
    const land = () => {
      setLeaving(null);
      if (next === "close") onFinish();
      else {
        setDirection(step === 0 ? 1 : step);
        setScreen(next);
      }
    };
    if (reducedMotion) return land();
    setLeaving(step);
    leaveTimer.current = window.setTimeout(land, LEAVE_MS);
  };

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") go("close");
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const nav = {
    onAdvance: () => go(screen === LAST_SCREEN ? "close" : screen + 1),
    onBack: () => go(screen - 1),
    onSkip: () => go("close"),
  };
  const mascotSize = MASCOT_SIZE * scale;
  const travel = leaving ?? direction;

  return (
    <section
      ref={rootRef}
      aria-label="Welcome to inkling"
      {...stylex.props(styles.root, leaving === 0 && styles.closing)}
    >
      {screen === 0 ? (
        <WelcomeMascot
          key="welcome"
          size={mascotSize}
          faces={welcomeFaces}
          look={WELCOME_LOOK}
          speed={MASCOT_SPEED}
          side="right"
          leaving={leaving !== null}
          reducedMotion={reducedMotion}
        />
      ) : null}
      {screen === LAST_SCREEN ? (
        <WelcomeMascot
          key="farewell"
          size={mascotSize}
          faces={farewellFaces}
          look={FAREWELL_LOOK}
          speed={MASCOT_SPEED}
          side="left"
          leaving={leaving !== null}
          reducedMotion={reducedMotion}
        />
      ) : null}
      <div
        key={screen}
        {...stylex.props(
          styles.stage,
          styles.scaled(scale),
          leaving === null
            ? travel === 1
              ? styles.inForward
              : styles.inBack
            : leaving === 1
              ? styles.outForward
              : leaving === -1
                ? styles.outBack
                : styles.outClosing,
        )}
      >
        <Screen screen={screen} nav={nav} reducedMotion={reducedMotion} />
      </div>
    </section>
  );
}

const reduced = "@media (prefers-reduced-motion: reduce)";
const enter = "cubic-bezier(0.22, 1, 0.36, 1)";
const leave = "cubic-bezier(0.55, 0, 0.75, 0.4)";
const inFromRight = stylex.keyframes({ from: { opacity: 0, translate: "40px 0" } });
const inFromLeft = stylex.keyframes({ from: { opacity: 0, translate: "-40px 0" } });
const outToLeft = stylex.keyframes({
  to: { opacity: 0, translate: "-40px 0", filter: "blur(6px)" },
});
const outToRight = stylex.keyframes({
  to: { opacity: 0, translate: "40px 0", filter: "blur(6px)" },
});
const outInPlace = stylex.keyframes({ to: { opacity: 0, filter: "blur(6px)" } });
const fadeOut = stylex.keyframes({ to: { opacity: 0 } });

const styles = stylex.create({
  root: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    overflow: "hidden",
    backgroundColor: color.window,
    color: color.ink,
    fontFamily: font.body,
  },
  closing: {
    pointerEvents: "none",
    animationName: { default: fadeOut, [reduced]: "none" },
    animationDuration: "320ms",
    animationTimingFunction: "ease-in",
    animationFillMode: "both",
  },
  // Stage pixels: the stage scales as a whole, so nothing inside animates its own scale.
  stage: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 960,
    height: 540,
    transformOrigin: "center",
    animationFillMode: "both",
  },
  scaled: (scale: number) => ({ transform: `translate(-50%, -50%) scale(${scale})` }),
  inForward: {
    animationName: { default: inFromRight, [reduced]: "none" },
    animationDuration: "560ms",
    animationTimingFunction: enter,
  },
  inBack: {
    animationName: { default: inFromLeft, [reduced]: "none" },
    animationDuration: "560ms",
    animationTimingFunction: enter,
  },
  outForward: {
    pointerEvents: "none",
    animationName: { default: outToLeft, [reduced]: "none" },
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: leave,
  },
  outBack: {
    pointerEvents: "none",
    animationName: { default: outToRight, [reduced]: "none" },
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: leave,
  },
  outClosing: {
    pointerEvents: "none",
    animationName: { default: outInPlace, [reduced]: "none" },
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: leave,
  },
});
