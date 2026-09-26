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
 * land.
 *
 * Two nested elements, and the split matters. The outer one carries the position
 * and never transitions, so a hop puts the mascot where it is going in one frame.
 * The inner one carries the scale and is the only thing that animates. With both
 * on the same element the browser interpolates the translate along with the
 * scale, and the mascot slides across the library while swelling up — which is
 * the dash this replaced, arriving through the back door.
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
      style={{ transform: `translate3d(${roam.x - half}px, ${roam.y - half}px, 0)` }}
    >
      <div
        className="mascot-roam-body"
        style={{
          transform: `scale(${roam.scale})`,
          transition: `transform ${roam.hopMs}ms ${roam.ease}, opacity 320ms ease ${roam.fadeMs}ms`,
          opacity: walkingHome ? 0 : 1,
        }}
      >
        <LiveMascotFigure size={MASCOT_SIZE} />
      </div>
    </div>
  );
}
