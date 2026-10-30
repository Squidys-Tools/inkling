import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Edit01Icon,
  PlusSignIcon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type FormEvent, type RefObject } from "react";
import { ContextMenu, type ContextMenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { SpaceKind, StoredSpace } from "../../lib/libraryApi";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { IconButton } from "../../ui/IconButton";
import { SpaceMark } from "../../ui/SpaceMark";
import { countClass, rowClass } from "./Sidebar";

const tool =
  "grid flex-none place-items-center rounded-[5px] p-[3px] text-muted cursor-pointer transition-[color,background-color] duration-150 ease-[ease] focus-visible:outline-none!";

export type SpaceRowActions = {
  select: (space: StoredSpace) => void;
  cycleColor: (space: StoredSpace) => void;
  move: (space: StoredSpace, direction: -1 | 1) => void;
  startRename: (space: StoredSpace) => void;
  rename: (space: StoredSpace, name: string) => void;
  cancelRename: () => void;
  remove: (space: StoredSpace) => void;
};

export type SpaceDraft = {
  isOpen: boolean;
  name: string;
  kind: SpaceKind;
  query: string;
  toggle: () => void;
  setName: (name: string) => void;
  setKind: (kind: SpaceKind) => void;
  cancel: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
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
  renaming: {
    id: string | null;
    draft: string;
    setDraft: (draft: string) => void;
    inputRef: RefObject<HTMLInputElement | null>;
  };
  actions: SpaceRowActions;
  draft: SpaceDraft;
  draftNameInputRef: RefObject<HTMLInputElement | null>;
}) {
  const menuLayer = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    target: HTMLElement;
  } | null>(null);
  const menuSpace = collapsed ? spaces.find((space) => space.id === menu?.id) : null;
  const menuIndex = menuSpace ? spaces.indexOf(menuSpace) : -1;
  const entries: ContextMenuEntry[] = menuSpace
    ? [
        {
          label: "Move up",
          icon: ArrowUp01Icon,
          disabled: menuIndex === 0,
          onSelect: () => {
            actions.move(menuSpace, -1);
            setMenu(null);
          },
        },
        {
          label: "Move down",
          icon: ArrowDown01Icon,
          disabled: menuIndex === spaces.length - 1,
          onSelect: () => {
            actions.move(menuSpace, 1);
            setMenu(null);
          },
        },
        {
          label: "Change colour",
          icon: Folder01Icon,
          onSelect: () => {
            actions.cycleColor(menuSpace);
            setMenu(null);
          },
        },
        {
          label: "Rename",
          icon: Edit01Icon,
          onSelect: () => {
            actions.startRename(menuSpace);
            setMenu(null);
          },
        },
        {
          label: "Delete",
          icon: Cancel01Icon,
          onSelect: () => {
            actions.remove(menuSpace);
            setMenu(null);
          },
        },
      ]
    : [];
  return (
    <div className={experimental ? "codex-spaces" : undefined} data-collapsed={collapsed}>
      <div ref={menuLayer} />
      {menu && menuSpace && (
        <ContextMenu
          key={`${menu.id}:${menu.x}:${menu.y}`}
          x={menu.x}
          y={menu.y}
          label={`${menuSpace.name} actions`}
          entries={entries}
          returnFocus={menu.target}
          container={menuLayer}
          onClose={() => setMenu(null)}
        />
      )}

      {experimental && collapsed && (
        <nav className="codex-spaces-rail" aria-label="Spaces">
          {spaces.map((space) => (
            <Button
              key={space.id}
              className={cx(
                rowClass,
                "codex-space-icon flex-none",
                activeSpaceId === space.id && "bg-accent-soft",
              )}
              aria-label={space.name}
              data-tooltip={space.name}
              aria-pressed={activeSpaceId === space.id}
              onClick={() => actions.select(space)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({
                  id: space.id,
                  x: event.clientX,
                  y: event.clientY,
                  target: event.currentTarget,
                });
              }}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                event.preventDefault();
                const r = event.currentTarget.getBoundingClientRect();
                setMenu({ id: space.id, x: r.right, y: r.top, target: event.currentTarget });
              }}
            >
              <span className="grid w-4 flex-none place-items-center">
                <SpaceMark color={space.color} />
              </span>
            </Button>
          ))}
        </nav>
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
            {spaces.map((space) => {
              const selected = activeSpaceId === space.id;
              return (
                <div
                  key={space.id}
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
                  {renaming.id === space.id ? (
                    <input
                      ref={renaming.inputRef}
                      className="min-h-[26px] w-full min-w-0 flex-1 rounded-lg border border-accent bg-surface px-2 py-0 text-[13px] text-ink outline-none!"
                      value={renaming.draft}
                      aria-label={`Rename ${space.name}`}
                      maxLength={80}
                      onChange={(event) => renaming.setDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") actions.rename(space, renaming.draft);
                        else if (event.key === "Escape") actions.cancelRename();
                      }}
                      // Blur commits, matching Finder/Explorer/VS Code rename fields:
                      // silently discarding typed text loses work, while an
                      // accidental save is one rename away from fixed.
                      onBlur={() => actions.rename(space, renaming.draft)}
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
                        className={cx(
                          countClass,
                          "group-hover/space:hidden group-focus-within/space:hidden",
                        )}
                      >
                        {(
                          space.itemCount ?? (selected ? activeCount : undefined)
                        )?.toLocaleString()}
                      </span>
                    </Button>
                  )}
                  <span className="flex w-0 flex-none overflow-hidden opacity-0 transition-opacity duration-150 ease-[ease] group-hover/space:ml-2.5 group-hover/space:w-[72px] group-hover/space:opacity-100 group-focus-within/space:ml-2.5 group-focus-within/space:w-[72px] group-focus-within/space:opacity-100">
                    <Button
                      className={cx(tool, "hover:text-ink")}
                      aria-label={`Move ${space.name} up`}
                      data-tooltip="Move Space up"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.move(space, -1);
                      }}
                    >
                      <HugeiconsIcon icon={ArrowUp01Icon} size={12} />
                    </Button>
                    <Button
                      className={cx(tool, "hover:text-ink")}
                      aria-label={`Move ${space.name} down`}
                      data-tooltip="Move Space down"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.move(space, 1);
                      }}
                    >
                      <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                    </Button>
                    <Button
                      className={cx(tool, "hover:text-ink")}
                      aria-label={`Rename ${space.name}`}
                      data-tooltip="Rename Space"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.startRename(space);
                      }}
                    >
                      <HugeiconsIcon icon={Edit01Icon} size={12} />
                    </Button>
                    <Button
                      className={cx(tool, "hover:text-[#e08a5e]")}
                      aria-label={`Delete ${space.name}`}
                      data-tooltip="Delete Space"
                      onClick={(event) => {
                        event.stopPropagation();
                        actions.remove(space);
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            {draft.isOpen && (
              <motion.form
                key="space-form"
                className="grid gap-2 px-2.5 pt-1.5 pb-2.5"
                initial={{ opacity: 0, transform: "translateY(-6px)" }}
                animate={{ opacity: 1, transform: "translateY(0)" }}
                exit={{ opacity: 0, transform: "translateY(-4px)" }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                onSubmit={draft.submit}
              >
                <input
                  ref={draftNameInputRef}
                  className="min-h-[33px] w-full rounded-lg border border-border bg-surface px-2.5 py-0 text-[13px] text-ink outline-none! focus:border-accent"
                  value={draft.name}
                  onChange={(event) => draft.setName(event.target.value)}
                  placeholder={
                    draft.kind === "smart" && draft.query.trim()
                      ? `Save “${draft.query.trim()}” as…`
                      : "Name this space"
                  }
                  aria-label="Space name"
                  maxLength={80}
                />
                {/* Native radios rather than role="radio" buttons: the group gets
            arrow-key selection, one tab stop and group semantics from the
            platform instead of from ARIA we would then have to maintain. */}
                <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-[3px] rounded-button border border-border bg-surface p-[3px]">
                  <legend className="sr-only">How this Space fills</legend>
                  {(["smart", "regular"] as const).map((kind) => (
                    <label
                      key={kind}
                      className={cx(
                        // The real input is clipped, so the label draws its focus ring.
                        "flex items-center justify-center rounded-md py-1.5 text-[12px] cursor-pointer transition-[color,background-color] duration-150 ease-[ease] has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-accent",
                        draft.kind === kind
                          ? "bg-accent-soft font-semibold text-accent"
                          : "text-muted hover:text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="space-kind"
                        className="sr-only"
                        value={kind}
                        checked={draft.kind === kind}
                        aria-describedby="space-kind-hint"
                        onChange={() => draft.setKind(kind)}
                      />
                      {kind === "smart" ? "Smart" : "Regular"}
                    </label>
                  ))}
                </fieldset>
                <p className="m-0 text-[11px] leading-[1.45] text-muted" id="space-kind-hint">
                  {draft.kind === "regular"
                    ? "Holds only the items you file into it. Open an item and pick a Space to add it."
                    : draft.query.trim()
                      ? "A Smart Space that updates automatically as items match this search."
                      : "An empty Smart Space matches everything you have saved."}
                </p>
                <div className="flex items-center justify-between gap-2.5">
                  <Button variant="text" onClick={draft.cancel}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit">
                    Create Space
                  </Button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
