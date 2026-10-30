import { Folder01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence } from "motion/react";
import type { RefObject } from "react";
import type { StoredSpace } from "../../lib/libraryApi";
import { IconButton } from "../../ui/IconButton";
import { SpaceDraftForm, type SpaceDraft } from "./SpaceDraftForm";
import { SpaceRow, type SpaceRenaming } from "./SpaceRow";
import { SpacesRail } from "./SpacesRail";

export type SpaceRowActions = {
  select: (space: StoredSpace) => void;
  cycleColor: (space: StoredSpace) => void;
  move: (space: StoredSpace, direction: -1 | 1) => void;
  startRename: (space: StoredSpace) => void;
  rename: (space: StoredSpace, name: string) => void;
  cancelRename: () => void;
  remove: (space: StoredSpace) => void;
};

export function SpacesSection({
  experimental = false,
  collapsed = false,
  spaces,
  activeSpaceId,
  activeCount,
  renaming,
  actions,
  draft,
  draftNameInputRef,
}: {
  experimental?: boolean;
  collapsed?: boolean;
  spaces: StoredSpace[];
  activeSpaceId: string | null;
  activeCount: number;
  renaming: SpaceRenaming;
  actions: SpaceRowActions;
  draft: SpaceDraft;
  draftNameInputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className={experimental ? "codex-spaces" : undefined} data-collapsed={collapsed}>
      {experimental && collapsed && (
        <SpacesRail spaces={spaces} activeSpaceId={activeSpaceId} actions={actions} />
      )}
      <div
        className={experimental ? "codex-spaces-content" : undefined}
        inert={collapsed}
        aria-hidden={collapsed || undefined}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex h-7 items-center justify-between px-2.5 font-body text-[12px] leading-4 font-medium tracking-[0.02em] text-muted">
            <span className="flex items-center gap-2.5">
              {experimental && <HugeiconsIcon icon={Folder01Icon} size={15} />}Spaces
            </span>
            <IconButton label="Add a Space" size="xs" className="-mr-[3px]" onClick={draft.toggle}>
              <HugeiconsIcon icon={PlusSignIcon} size={14} />
            </IconButton>
          </div>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
            {spaces.map((space) => (
              <SpaceRow
                key={space.id}
                space={space}
                selected={activeSpaceId === space.id}
                activeCount={activeCount}
                renaming={renaming}
                actions={actions}
              />
            ))}
          </div>
          <AnimatePresence mode="wait">
            {draft.isOpen && (
              <SpaceDraftForm key="space-form" draft={draft} inputRef={draftNameInputRef} />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
