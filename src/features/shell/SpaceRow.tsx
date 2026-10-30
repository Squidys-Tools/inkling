import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Edit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { RefObject } from "react";
import type { StoredSpace } from "../../lib/libraryApi";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { SpaceMark } from "../../ui/SpaceMark";
import { countClass, rowClass } from "./Sidebar";
import type { SpaceRowActions } from "./SpacesSection";

export type SpaceRenaming = {
  id: string | null;
  draft: string;
  setDraft: (draft: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

export function SpaceRow({
  space,
  selected,
  activeCount,
  renaming: { id: renamingId, draft, setDraft, inputRef },
  actions,
}: {
  space: StoredSpace;
  selected: boolean;
  activeCount: number;
  renaming: SpaceRenaming;
  actions: SpaceRowActions;
}) {
  return (
    <div
      className={cx(
        rowClass,
        "group/space text-[14px]",
        selected ? "font-semibold text-ink-active" : "text-ink-soft hover:text-ink",
      )}
    >
      <Button
        className="mr-2.5 grid size-4 flex-none place-items-center p-0 cursor-pointer focus-visible:outline-none!"
        data-tooltip={`Change color (now ${space.color})`}
        aria-label={`Change color of ${space.name}`}
        onClick={() => actions.cycleColor(space)}
      >
        <span className="block" aria-hidden="true">
          <SpaceMark color={space.color} />
        </span>
      </Button>
      {renamingId === space.id ? (
        <input
          ref={inputRef}
          className="min-h-[26px] w-full min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2 py-0 text-[13px] text-ink outline-none!"
          value={draft}
          aria-label={`Rename ${space.name}`}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") actions.rename(space, draft);
            else if (event.key === "Escape") actions.cancelRename();
          }}
          // Blur commits, matching Finder/Explorer/VS Code rename fields:
          // silently discarding typed text loses work, while an
          // accidental save is one rename away from fixed.
          onBlur={() => actions.rename(space, draft)}
        />
      ) : (
        <Button
          className="flex min-w-0 flex-1 items-center gap-2.5 p-0 text-left cursor-pointer focus-visible:outline-none!"
          onClick={() => actions.select(space)}
          aria-pressed={selected}
        >
          <span className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden whitespace-nowrap [overscroll-behavior-inline:contain] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {space.name}
          </span>
          <span
            className={cx(countClass, "group-hover/space:hidden group-focus-within/space:hidden")}
          >
            {(space.itemCount ?? (selected ? activeCount : undefined))?.toLocaleString()}
          </span>
        </Button>
      )}
      <span className="flex w-0 flex-none overflow-hidden opacity-0 transition-opacity duration-150 ease-[ease] group-hover/space:ml-2.5 group-hover/space:w-[72px] group-hover/space:opacity-100 group-focus-within/space:ml-2.5 group-focus-within/space:w-[72px] group-focus-within/space:opacity-100">
        <SpaceTool
          label={`Move ${space.name} up`}
          tooltip="Move Space up"
          icon={ArrowUp01Icon}
          onSelect={() => actions.move(space, -1)}
        />
        <SpaceTool
          label={`Move ${space.name} down`}
          tooltip="Move Space down"
          icon={ArrowDown01Icon}
          onSelect={() => actions.move(space, 1)}
        />
        <SpaceTool
          label={`Rename ${space.name}`}
          tooltip="Rename Space"
          icon={Edit01Icon}
          onSelect={() => actions.startRename(space)}
        />
        <SpaceTool
          label={`Delete ${space.name}`}
          tooltip="Delete Space"
          icon={Cancel01Icon}
          danger
          onSelect={() => actions.remove(space)}
        />
      </span>
    </div>
  );
}

function SpaceTool({
  label,
  tooltip,
  icon,
  danger = false,
  onSelect,
}: {
  label: string;
  tooltip: string;
  icon: IconSvgElement;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      className={cx(
        "grid flex-none place-items-center rounded-[5px] p-[3px] text-muted cursor-pointer transition-[color,background-color] duration-150 ease-[ease] focus-visible:outline-none!",
        danger ? "hover:text-[#e08a5e]" : "hover:text-ink",
      )}
      aria-label={label}
      data-tooltip={tooltip}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <HugeiconsIcon icon={icon} size={12} />
    </Button>
  );
}
