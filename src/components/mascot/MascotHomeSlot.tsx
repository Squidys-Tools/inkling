import { LiveMascotFigure } from "./mascotStore";
import { useRoam } from "./roamStore";
import { MASCOT_SIZE } from "./safeSpots";

/**
 * The sidebar slot. It holds the body while the mascot is home, and while an
 * outing is under way it holds a faint empty silhouette, so the library does not
 * simply lose its mascot for half a minute with no sign of where it went.
 *
 * The commuting to the search field on focus is unchanged: the slot still
 * collapses, and the field still shows the eyes.
 */
export function MascotHomeSlot({ isSearchFocused }: { isSearchFocused: boolean }) {
  const away = useRoam().away;
  return (
    <div className={`brand-mark${isSearchFocused ? " is-away" : ""}`} aria-hidden="true">
      {away ? <span className="mascot-home-empty" /> : <LiveMascotFigure size={MASCOT_SIZE} />}
    </div>
  );
}
