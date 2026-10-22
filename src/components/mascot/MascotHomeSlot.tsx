import { LiveMascotFigure } from "./mascotStore";

/** The sidebar slot. It collapses while the search field is focused, and the field shows the eyes. */
export function MascotHomeSlot({ isSearchFocused }: { isSearchFocused: boolean }) {
  return (
    <div className={`brand-mark${isSearchFocused ? " is-away" : ""}`} aria-hidden="true">
      <LiveMascotFigure size={44} />
    </div>
  );
}
