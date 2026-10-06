import { useEffect } from "react";
import { LiveMascotFigure } from "./mascotStore";
import { setRoamBody, setRoamNode, useRoam, watchRoamInputs } from "./roamStore";
import { MASCOT_SIZE } from "./drift";

/**
 * The mascot's body while it is out of its slot.
 *
 * One instance, mounted only while an outing is under way, and it never receives
 * input: no pointer events, no focus, `aria-hidden`. It sits under every modal
 * layer and over the library. That is the only reason it is allowed over cards
 * and controls at all - it cannot take a click, so it is decoration rather than
 * an obstruction.
 *
 * The nodes are handed to the store through callback refs, not an effect. This
 * component renders null until an outing starts, so an effect would run once
 * with both refs still null and never run again, leaving the store with nothing
 * to draw on. The frames are written straight to these nodes, so the mascot can
 * move continuously without re-rendering React sixty times a second.
 */
export function MascotRoamLayer() {
  const away = useRoam().away;
  useEffect(() => watchRoamInputs(), []);

  if (!away) return null;
  return (
    <div className="mascot-roam" ref={setRoamNode} aria-hidden="true">
      <div className="mascot-roam-body" ref={setRoamBody}>
        <LiveMascotFigure size={MASCOT_SIZE} />
      </div>
    </div>
  );
}



