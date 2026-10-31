import * as stylex from "@stylexjs/stylex";
import { color, onboardingColor } from "@inkling/ui/tokens.stylex";
import { useEffect, useState } from "react";
import { GridReveal } from "./GridReveal.tsx";
import { onboardingPhotos } from "./media.ts";

const MEMORY = "orange rocky cliffs, trees and bushes";
/** The headline gets the first moments; the query starts typing once it has mostly landed. */
const TYPE_START_MS = 1400;
const TYPE_MS = 36;
/** A breath after the last letter, so the finished sentence is read before the trail leaves it. */
const TYPED_HOLD_MS = 320;
const TRAIL_DOTS = 8;
const DOT_STEP_MS = 85;
const DOT_MS = 420;
/** The photo is handed over as the last dot lands. */
const SEARCH_MS = (TRAIL_DOTS - 1) * DOT_STEP_MS + DOT_MS;
const CARD_W = 264;
const CARD_H = 308;

type Phase = "typing" | "searching" | "found";

/** Dots hop along a shallow arc between the two cards; each is placed once and never moves. */
const trail = Array.from({ length: TRAIL_DOTS }, (_, i) => {
  const t = i / (TRAIL_DOTS - 1);
  return { left: 18 + t * 134, top: -Math.sin(Math.PI * t) * 22, delay: i * DOT_STEP_MS };
});

/**
 * Screen three's demo: half a memory typed into the left card, a trail of ink
 * dots hopping across to the right card, and that card resolving into the
 * photo it meant. Plays once per visit; reduced motion lands on the finished frame.
 */
export function MemoryMatch({ reducedMotion }: { reducedMotion: boolean }) {
  const [typed, setTyped] = useState(reducedMotion ? MEMORY.length : 0);
  const [phase, setPhase] = useState<Phase>(reducedMotion ? "found" : "typing");

  useEffect(() => {
    if (phase !== "typing") return;
    if (typed >= MEMORY.length) {
      const timer = window.setTimeout(() => setPhase("searching"), TYPED_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(
      () => setTyped((count) => count + 1),
      typed === 0 ? TYPE_START_MS : TYPE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, typed]);

  useEffect(() => {
    if (phase !== "searching") return;
    const timer = window.setTimeout(() => setPhase("found"), SEARCH_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div aria-hidden="true">
      <div {...stylex.props(styles.card, styles.memoryCard)}>
        <img
          {...stylex.props(styles.art)}
          src={onboardingPhotos.redRocks}
          alt=""
          draggable={false}
        />
        {/* One inline run, so the caret follows the last letter as the line wraps. */}
        <span {...stylex.props(styles.text)}>
          <span>
            {MEMORY.slice(0, typed)}
            {phase === "typing" ? <span {...stylex.props(styles.caret)} /> : null}
          </span>
        </span>
      </div>
      <div {...stylex.props(styles.trail)}>
        {trail.map((dot, i) => {
          const last = i === TRAIL_DOTS - 1;
          return (
            <span
              key={dot.left}
              {...stylex.props(
                styles.dot,
                last && styles.lastDot,
                styles.dotAt(dot.left, dot.top),
                phase !== "typing" && (last ? styles.lastDotLit : styles.dotLit),
                phase !== "typing" && styles.dotDelay(dot.delay),
              )}
            />
          );
        })}
      </div>
      <div {...stylex.props(styles.slot)} />
      {/* Mounted when the search begins, so the grid only starts working once the trail does. */}
      {phase === "typing" ? null : (
        <GridReveal
          style={[styles.card, styles.found]}
          src={phase === "found" ? onboardingPhotos.redRocks : null}
          aspect={CARD_W / CARD_H}
          estimatedDuration={1500}
          reducedMotion={reducedMotion}
        />
      )}
    </div>
  );
}

const reduced = "@media (prefers-reduced-motion: reduce)";
const rise = stylex.keyframes({ from: { opacity: 0, transform: "translateY(14px)" } });
const enter = stylex.keyframes({ from: { opacity: 0 } });
const blink = stylex.keyframes({ "50%": { opacity: 0 } });
const dotHop = stylex.keyframes({
  "0%": { opacity: 0, transform: "scale(0.2)" },
  "40%": { opacity: 1, transform: "scale(1.8)", boxShadow: `0 0 12px ${color.accent}` },
  "100%": { opacity: 0.5, transform: "scale(1)", boxShadow: "0 0 0 transparent" },
});
const lastDotHop = stylex.keyframes({
  "0%": { opacity: 0, transform: "scale(0.2)" },
  "40%": { opacity: 1, transform: "scale(2)", boxShadow: `0 0 16px ${color.accent}` },
  "100%": { opacity: 1, transform: "scale(1)", boxShadow: `0 0 6px ${color.accent}` },
});

const styles = stylex.create({
  card: {
    position: "absolute",
    boxSizing: "border-box",
    top: 0,
    width: CARD_W,
    height: CARD_H,
    overflow: "hidden",
    borderRadius: "18px",
    backgroundColor: color.surface,
    boxShadow: `0 16px 40px ${onboardingColor.softShadow}`,
  },
  memoryCard: {
    left: 131,
    animationName: { default: rise, [reduced]: "none" },
    animationDuration: "640ms",
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    animationDelay: "120ms",
    animationFillMode: "both",
  },
  found: {
    left: 565,
    animationName: { default: enter, [reduced]: "none" },
    animationDuration: "450ms",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
  },
  art: {
    position: "absolute",
    inset: -12,
    width: "calc(100% + 24px)",
    height: "calc(100% + 24px)",
    objectFit: "cover",
    filter: "blur(12px) brightness(0.5) saturate(0.9)",
  },
  text: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    textAlign: "center",
    fontSize: 21,
    lineHeight: 1.35,
    color: color.ink,
  },
  // Takes no room in the line (the right margin cancels its width), so it
  // never wraps on its own ahead of the word it follows.
  caret: {
    display: "inline-block",
    width: "1.5px",
    height: "1.05em",
    marginLeft: 2,
    marginRight: -3.5,
    verticalAlign: "-0.15em",
    backgroundColor: color.ink,
    animationName: blink,
    animationDuration: "1s",
    animationTimingFunction: "steps(1)",
    animationIterationCount: "infinite",
  },
  slot: {
    position: "absolute",
    boxSizing: "border-box",
    left: 565,
    top: 0,
    width: CARD_W,
    height: CARD_H,
    borderWidth: "1.5px",
    borderStyle: "dashed",
    borderColor: color.border,
    borderRadius: "18px",
    animationName: { default: rise, [reduced]: "none" },
    animationDuration: "640ms",
    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
    animationDelay: "260ms",
    animationFillMode: "both",
  },
  trail: { position: "absolute", left: 395, top: CARD_H / 2, width: 170, height: 0 },
  dot: {
    position: "absolute",
    width: 7,
    height: 7,
    marginTop: -3.5,
    marginLeft: -3.5,
    borderRadius: "50%",
    backgroundColor: color.accent,
    opacity: 0,
  },
  lastDot: { width: 10, height: 10, marginTop: -5, marginLeft: -5 },
  dotAt: (left: number, top: number) => ({ left, top }),
  // Runs once, so nothing repaints after the trail has lit.
  dotLit: {
    animationName: { default: dotHop, [reduced]: "none" },
    animationDuration: "420ms",
    animationTimingFunction: "cubic-bezier(0.3, 0.7, 0.3, 1)",
    animationFillMode: "both",
    opacity: { default: 0, [reduced]: 0.5 },
  },
  lastDotLit: {
    animationName: { default: lastDotHop, [reduced]: "none" },
    animationDuration: "420ms",
    animationTimingFunction: "cubic-bezier(0.3, 0.7, 0.3, 1)",
    animationFillMode: "both",
    opacity: { default: 0, [reduced]: 1 },
  },
  dotDelay: (ms: number) => ({ animationDelay: `${ms}ms` }),
});
