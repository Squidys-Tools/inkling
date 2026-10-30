import { useEffect, useState, type CSSProperties } from "react";
import { prefersReducedMotion } from "../../ui/reducedMotion";
import { GridReveal } from "./GridReveal";
import { onboardingPhotos } from "./onboardingMedia";

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
/** Matches --memory-card-w / --memory-card-h in onboarding.css. */
const CARD_ASPECT = 264 / 308;

type Phase = "typing" | "searching" | "found";

/** Dots hop along a shallow arc between the two cards; each is positioned once and never moves. */
const trail = Array.from({ length: TRAIL_DOTS }, (_, i) => {
  const t = i / (TRAIL_DOTS - 1);
  return { left: 18 + t * 134, top: -Math.sin(Math.PI * t) * 22, delay: i * DOT_STEP_MS };
});

/**
 * Screen three's demo: half a memory typed into the left card, a trail of
 * ink dots hopping across to the right card, and that card resolving into
 * the photo it meant. Plays once per visit, in that order; reduced motion
 * lands on the finished frame.
 */
export function MemoryMatch() {
  const [reduced] = useState(prefersReducedMotion);
  const [typed, setTyped] = useState(reduced ? MEMORY.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? "found" : "typing");

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
    <div className={`memory-match is-${phase}`} aria-hidden="true">
      <div className="first-run-card memory-card">
        <img className="memory-card-art" src={onboardingPhotos.redRocks} alt="" draggable={false} />
        {/* One inline run, so the caret follows the last letter as the line wraps. */}
        <span className="first-run-card-text">
          <span>
            {MEMORY.slice(0, typed)}
            {phase === "typing" ? <span className="memory-caret" /> : null}
          </span>
        </span>
      </div>
      <div className="memory-trail">
        {trail.map((dot, i) => (
          <span
            key={dot.left}
            className={i === TRAIL_DOTS - 1 ? "memory-dot is-last" : "memory-dot"}
            style={
              {
                left: dot.left,
                top: dot.top,
                "--memory-dot-delay": `${dot.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="memory-slot" />
      {/* Mounted when the search begins, so the grid only starts working once the trail does. */}
      {phase === "typing" ? null : (
        <GridReveal
          className="first-run-card memory-found"
          src={phase === "found" ? onboardingPhotos.redRocks : null}
          aspect={CARD_ASPECT}
          estimatedDuration={1500}
        />
      )}
    </div>
  );
}
