import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Edit01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { useRef, useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "../../components/ContextMenu/ContextMenu";
import type { StoredSpace } from "../../lib/libraryApi";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { SpaceMark } from "../../ui/SpaceMark";
import { rowClass } from "./Sidebar";
import type { SpaceRowActions } from "./SpacesSection";

// Collapsed Codex shows each Space as an icon, with its row tools in a context menu.
export function SpacesRail({
  spaces,
  activeSpaceId,
  actions,
}: {
  spaces: StoredSpace[];
  activeSpaceId: string | null;
  actions: SpaceRowActions;
}) {
  const menuLayer = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    id: string;
    x: number;
    y: number;
    target: HTMLElement;
  } | null>(null);
  const menuSpace = spaces.find((space) => space.id === menu?.id);
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
    <>
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
    </>
  );
}
