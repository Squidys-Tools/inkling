import { cx } from "../../ui/cx";
import { LiveMascotFigure } from "./mascotStore";

/** The sidebar slot. It collapses while the search field is focused, and the field shows the eyes. */
export function MascotHomeSlot({ isSearchFocused }: { isSearchFocused: boolean }) {
  return (
    <div
      className={cx(
        "h-11 flex-none origin-center overflow-hidden [transition:width_0.35s_cubic-bezier(0.2,0.8,0.2,1),opacity_0.3s_ease] [&_svg]:block [&_svg]:size-full",
        isSearchFocused ? "w-0 opacity-0" : "w-11",
      )}
      aria-hidden="true"
    >
      <LiveMascotFigure size={44} />
    </div>
  );
}
