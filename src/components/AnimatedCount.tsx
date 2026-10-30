import { useState } from "react";
import CountUp from "./CountUp";

/**
 * A count that rolls up when it first appears and replays on hover. The 0.5s delay only
 * applies to that first run, so later changes (a new search) show the right number at once.
 */
export function AnimatedCount({ value, className }: { value: number; className?: string }) {
  const [intro, setIntro] = useState(true);
  return (
    <CountUp
      to={value}
      className={className}
      format="compact"
      delay={intro ? 0.5 : 0}
      duration={0.5}
      trigger="load"
      replayOnHover
      onEnd={() => {
        // The library loads empty first; wait for a real count before dropping the delay.
        if (value > 0) setIntro(false);
      }}
    />
  );
}
