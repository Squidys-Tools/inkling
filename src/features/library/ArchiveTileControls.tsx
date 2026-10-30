import {
  CircleCheckIcon,
  CircleIcon,
  Delete02Icon,
  RotateLeft01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LibraryItem } from "../../lib/types";
import { cx } from "../../ui/cx";
import type { LibraryCardContext } from "./LibraryCard";

// Restore, delete and selection controls over an archived item's media.
export function ArchiveTileControls({
  item,
  context,
  isArchivedItemSelected,
}: {
  item: LibraryItem;
  context: LibraryCardContext;
  isArchivedItemSelected: boolean;
}) {
  const archiveSelectionMode = context.archiveSelectionMode === true;
  return (
    <div
      className={cx(
        "absolute right-2 bottom-2 z-2 flex items-center gap-1.5 transition-opacity duration-180 ease-[ease] motion-reduce:transition-none",
        archiveSelectionMode
          ? "opacity-100"
          : "opacity-0 group-focus-within/tile:opacity-100 group-hover/tile:opacity-100 group-focus-visible/tile:opacity-100",
      )}
    >
      {!archiveSelectionMode && (
        <button
          type="button"
          className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-ink px-3 py-0 font-body text-[12px]/4 font-semibold whitespace-nowrap text-surface transition-[scale] duration-160 ease-[ease] active:scale-96 motion-reduce:transition-none"
          data-tooltip="Restore to library"
          onClick={(event) => {
            event.stopPropagation();
            void context.onRestoreArchivedItem?.(item);
          }}
        >
          <HugeiconsIcon icon={RotateLeft01Icon} size={12} />
          Restore
        </button>
      )}
      <button
        type="button"
        className={cx(
          "grid size-7 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-[rgba(12,12,11,0.72)] p-0 backdrop-blur-[8px] transition-[background-color,color,scale] duration-180 ease-[ease] active:scale-96 motion-reduce:transition-none",
          !archiveSelectionMode
            ? "text-ink hover:bg-[#3a251d] hover:text-[#f0b095]"
            : cx(
                "hover:bg-[rgba(12,12,11,0.9)]",
                isArchivedItemSelected ? "text-accent" : "text-ink",
              ),
        )}
        aria-label={
          archiveSelectionMode
            ? `${isArchivedItemSelected ? "Deselect" : "Select"} ${item.title}`
            : `Delete ${item.title}`
        }
        aria-pressed={archiveSelectionMode ? isArchivedItemSelected : undefined}
        data-tooltip={
          archiveSelectionMode
            ? isArchivedItemSelected
              ? "Deselect item"
              : "Select item"
            : "Delete permanently"
        }
        onClick={(event) => {
          event.stopPropagation();
          if (archiveSelectionMode) {
            context.onToggleArchivedItem?.(item);
          } else {
            void context.onDeleteArchivedItem?.(item);
          }
        }}
      >
        <HugeiconsIcon
          icon={
            archiveSelectionMode
              ? isArchivedItemSelected
                ? CircleCheckIcon
                : CircleIcon
              : Delete02Icon
          }
          size={archiveSelectionMode ? 18 : 13}
        />
      </button>
    </div>
  );
}
