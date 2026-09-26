import { useEffect } from "react";
import { LiveMascotFigure } from "./mascotStore";
import { useRoam, watchRoamInputs } from "./roamStore";
import { MASCOT_SIZE } from "./safeSpots";

/**
 * The mascot's body while it is out of its slot.
 *
 * One instance, mounted only while an outing is under way, and it never receives
 * input: no pointer events, no focus, `aria-hidden`. It sits under every modal
 * layer and over the library, so cards stay readable and clicks land where they
 * land. Travel is a transform transition, so the 60fps engine frames below it
 * cost nothing extra and App never re-renders.
 */
export function MascotRoamLayer() {
  const roam = useRoam();
  useEffect(() => watchRoamInputs(), []);
  if (!roam.away) return null;
  const half = MASCOT_SIZE / 2;
  const walkingHome = roam.phase === "returning";
  return (
    <div
      className="mascot-roam"
      aria-hidden="true"
      style={{
        transform: `translate3d(${roam.x - half}px, ${roam.y - half}px, 0)`,
        transition: `transform ${roam.travelMs}ms cubic-bezier(.2,.7,.2,1), opacity 320ms ease ${roam.fadeMs}ms`,
        opacity: walkingHome ? 0 : 1,
      }}
    >
      <LiveMascotFigure size={MASCOT_SIZE} />
    </div>
  );
}
