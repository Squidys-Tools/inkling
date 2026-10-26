import { Grid2X2Icon, ListViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import type { Ref } from "react";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { cx } from "../../ui/cx";
import type { Appearance } from "../settings/appearance";
import { LIBRARY_VIEW_TRANSITION_MS } from "./useLibraryView";

// `view-dock` is where Tooltip anchors liquid glass tips.
export function ViewDock({
  ref,
  look,
  show,
  listMode,
  selectionListMode,
  onSwitch,
}: {
  ref: Ref<HTMLDivElement>;
  look: Appearance["viewToggle"];
  show: boolean;
  listMode: boolean;
  selectionListMode: boolean;
  onSwitch: (listMode: boolean) => void;
}) {
  return (
    <div className="view-dock absolute bottom-4 left-1/2 z-2 -translate-x-1/2" ref={ref}>
      {show && look === "segmented" && (
        <SegmentedControl
          className="glass"
          name="library-view"
          label="View options"
          value={selectionListMode ? "list" : "grid"}
          onChange={(view) => onSwitch(view === "list")}
          options={[
            { value: "grid", label: "Grid" },
            { value: "list", label: "List" },
          ]}
        />
      )}
      {show && look === "pill" && (
        <fieldset className="glass relative m-0 flex h-[34px] min-w-0 flex-none items-center gap-0.5 rounded-full p-[3px]">
          <legend className="visually-hidden">View options</legend>
          <motion.span
            className="pointer-events-none absolute top-[3px] left-[3px] z-0 size-[26px] rounded-full bg-glass-active"
            aria-hidden="true"
            initial={false}
            animate={{
              transform: selectionListMode ? "translateX(28px)" : "translateX(0px)",
            }}
            transition={{
              duration: LIBRARY_VIEW_TRANSITION_MS / 1000,
              ease: [0.77, 0, 0.175, 1],
            }}
          />
          <ViewButton
            label="Grid view"
            icon={Grid2X2Icon}
            selected={!listMode}
            onClick={() => onSwitch(false)}
          />
          <ViewButton
            label="List view"
            icon={ListViewIcon}
            selected={listMode}
            onClick={() => onSwitch(true)}
          />
        </fieldset>
      )}
    </div>
  );
}

function ViewButton({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: typeof Grid2X2Icon;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(
        "relative z-1 grid size-[26px] cursor-pointer place-items-center rounded-full border-0 bg-transparent p-0",
        "transition-[color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:[transform:scale(0.96)]",
        selected ? "text-ink" : "text-muted",
      )}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      data-tooltip={label}
    >
      <HugeiconsIcon icon={icon} size={15} />
    </button>
  );
}
