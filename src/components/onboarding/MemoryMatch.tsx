import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../mascot/mascotStore";
import { GridReveal } from "./GridReveal";
import { onboardingPhotos } from "./onboardingMedia";

const MEMORY = "that red rocky place, maybe autumn";
const TYPE_MS = 42;
const TYPE_START_MS = 500;
/** Matches the connector's CSS transition, so the photo starts as the dot lands. */
const TRAVEL_MS = 700;
const CARD_ASPECT = 168 / 196;

type Phase = "typing" | "searching" | "found";

/**
 * Screen three's demo: half a memory typed into the left card, carried along
 * the connector, and the right card resolving into the photo it meant. Plays
 * once per visit; reduced motion lands on the finished frame.
 */
export function MemoryMatch() {
  const [reduced] = useState(prefersReducedMotion);
  const [typed, setTyped] = useState(reduced ? MEMORY.length : 0);
  const [phase, setPhase] = useState<Phase>(reduced ? "found" : "typing");

  useEffect(() => {
    if (phase !== "typing") return;
    if (typed >= MEMORY.length) {
      const timer = window.setTimeout(() => setPhase("searching"), 260);
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
    const timer = window.setTimeout(() => setPhase("found"), TRAVEL_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return (
    <div className={`memory-match is-${phase}`} aria-hidden="true">
      <div className="first-run-card memory-card" style={{ left: 204, top: 52 }}>
        <img className="memory-card-art" src={onboardingPhotos.redRocks} alt="" draggable={false} />
        <span className="first-run-card-text">
          {MEMORY.slice(0, typed)}
          {phase === "typing" ? <span className="memory-caret" /> : null}
        </span>
      </div>
      <div className="first-run-connector" style={{ left: 396, top: 150 }}>
        <span className="first-run-connector-fill" />
        <span className="first-run-connector-dot" />
      </div>
      <GridReveal
        className="first-run-card memory-found"
        src={phase === "found" ? onboardingPhotos.redRocks : null}
        aspect={CARD_ASPECT}
      />
      <span className="first-run-caption" style={{ left: 204, top: 260 }}>
        half a memory
      </span>
      <span className="first-run-caption" style={{ left: 588, top: 260 }}>
        the one you meant
      </span>
    </div>
  );
}
