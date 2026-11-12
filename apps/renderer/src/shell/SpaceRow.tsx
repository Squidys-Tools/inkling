import MoreHorizontalIcon from "@hugeicons/core-free-icons/MoreHorizontalIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { type PointerEvent, useRef, useState } from "react";
import { color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { desktop } from "../desktop.ts";
import { search } from "../library/search.ts";
import { deleteSpace, moveSpace, recolorSpace, renameSpace } from "../library/spaces.ts";
import { spaceRowMarker } from "../markers.stylex.ts";
import { CompactSpaceRow } from "./CompactSpaceRow.tsx";
import { setSidebarOpen } from "../libraryView/viewState.ts";
import { slidingSelection } from "./NavRow.tsx";
import { dragSteps } from "./sidebarGeometry.ts";
import { SpaceMark } from "./SpaceMark.tsx";
import { SpaceStack } from "./SpaceStack.tsx";
import { opensMenu, openSpaceMenu } from "./spaceMenu.ts";

async function confirmDelete(space: Space) {
  // A Regular Space's filing is the user's own work, so emptying it asks first.
  if (space.kind !== "regular" || !space.itemCount) return true;
  const options = {
    message: `Delete the Space “${space.name}”?`,
    detail: `Its ${space.itemCount} ${space.itemCount === 1 ? "item stays" : "items stay"} in your library.`,
    confirmLabel: "Delete Space",
    destructive: true,
  };
  return desktop
    ? desktop.confirm(options)
    : window.confirm(`${options.message}\n\n${options.detail}`);
}

export function SpaceRow({
  space,
  selected,
  count,
  compact,
  shelf,
  index,
  lastIndex,
}: {
  space: Space;
  selected: boolean;
  count: number | undefined;
  compact: boolean;
  /** The Shelf look: a taller row led by a stack of the Space's newest items. */
  shelf: boolean;
  index: number;
  lastIndex: number;
}) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [lift, setLift] = useState<number | null>(null);
  const dragged = useRef(false);
  const refocus = useRef(false);

  const commit = async (draft: string) => {
    setRenaming(null);
    // A failed rename reopens the field with what was typed, so nothing is lost.
    if (!(await renameSpace(space, draft))) setRenaming(draft);
  };

  const remove = async () => {
    if (!(await confirmDelete(space))) return;
    if ((await deleteSpace(space)) && selected) void navigate({ to: "/" });
  };
  const can = { up: index > 0, down: index < lastIndex };
  const actions = {
    up: () => void moveSpace(space, -1),
    down: () => void moveSpace(space, 1),
    color: () => void recolorSpace(space),
    rename: () => {
      if (compact) setSidebarOpen(true);
      setRenaming(space.name);
    },
    delete: () => void remove(),
  };
  if (compact && renaming === null)
    return <CompactSpaceRow space={space} selected={selected} can={can} actions={actions} />;

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (event.button !== 0 || renaming !== null || lastIndex === 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    const row = event.currentTarget;
    const gap = row.parentElement ? parseFloat(getComputedStyle(row.parentElement).rowGap) : 0;
    const pitch = row.offsetHeight + (gap || 0);
    const startY = event.clientY;
    let steps = 0;
    // Listen on the window: reordering moves this row's node, which would drop a pointer capture.
    const listening = new AbortController();
    const signal = listening.signal;
    const end = () => {
      listening.abort();
      setLift(null);
      // After this release's click: one that lands outside the row would leave the flag set.
      setTimeout(() => (dragged.current = false));
    };
    window.addEventListener(
      "pointermove",
      (move) => {
        const offset = move.clientY - startY;
        if (!dragged.current && Math.abs(offset) < 5) return;
        dragged.current = true;
        const wanted = dragSteps(offset, pitch, index, lastIndex);
        // Each crossed row is one swap, shown at once, so the list reorders under the pointer.
        for (; steps < wanted; steps++) void moveSpace(space, 1);
        for (; steps > wanted; steps--) void moveSpace(space, -1);
        const held = Math.max(-index * pitch, Math.min((lastIndex - index) * pitch, offset));
        setLift(held - steps * pitch);
      },
      { signal },
    );
    window.addEventListener("pointerup", end, { signal });
    window.addEventListener("pointercancel", end, { signal });
    window.addEventListener("blur", end, { signal });
  };

  return (
    // Dragging is a pointer shortcut; the row's menu holds Move up and Move down for the keyboard.
    <div
      onPointerDown={startDrag}
      onClickCapture={(event) => {
        // The release that ends a drag must not open the Space it was dropped on.
        if (!dragged.current) return;
        dragged.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        if (renaming === null) void openSpaceMenu(event, space.name, can, actions);
      }}
      data-sidebar-selected={slidingSelection(selected && !shelf)}
      {...stylex.props(
        styles.row,
        shelf && styles.shelfRow,
        selected && (shelf ? styles.shelfSelected : styles.selected),
        lift !== null && styles.lifted,
        lift !== null && styles.lift(lift),
        spaceRowMarker,
      )}
    >
      <button
        type="button"
        aria-label={`Change color of ${space.name}`}
        title={`Change color (now ${space.color})`}
        // One tab stop per row, like every other sidebar row; the row's menu changes color by keyboard.
        tabIndex={-1}
        onClick={() => void recolorSpace(space)}
        {...stylex.props(styles.mark, shelf && styles.shelfMark)}
      >
        <SpaceMark small={shelf} color={space.color} hollow={space.kind === "smart"} />
      </button>
      {shelf && <SpaceStack space={space} />}
      {renaming !== null ? (
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- The field appears because the user asked to rename; typing goes straight into it.
          autoFocus
          value={renaming}
          aria-label={`Rename ${space.name}`}
          maxLength={80}
          onChange={(event) => setRenaming(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter" && event.key !== "Escape") return;
            // The field goes away under the keyboard, so focus returns to the row it renamed.
            refocus.current = true;
            if (event.key === "Enter") void commit(renaming);
            else setRenaming(null);
          }}
          // Blur keeps what was typed, like renaming in a file manager.
          onBlur={() => void commit(renaming)}
          {...stylex.props(styles.rename, shelf && styles.shelfRename)}
        />
      ) : (
        <Link
          to="/space/$id"
          params={{ id: space.id }}
          ref={(link) => {
            if (!link || !refocus.current) return;
            refocus.current = false;
            link.focus({ preventScroll: true });
          }}
          // A native link drag would cancel the pointer events that reorder the row.
          draggable={false}
          onClick={() => search.clear()}
          onKeyDown={(event) => {
            if (opensMenu(event)) void openSpaceMenu(event, space.name, can, actions);
          }}
          aria-current={selected ? "page" : undefined}
          {...stylex.props(styles.name, shelf && styles.shelfName)}
        >
          <span data-sidebar-label {...stylex.props(styles.nameText, shelf && styles.shelfText)}>
            {space.name}
          </span>
          {shelf ? (
            <span data-sidebar-label {...stylex.props(styles.sub)}>
              {[
                space.kind === "smart" && "Smart",
                count !== undefined &&
                  `${count.toLocaleString()} ${count === 1 ? "item" : "items"}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          ) : (
            <span data-sidebar-label {...stylex.props(styles.count)}>
              {count?.toLocaleString()}
            </span>
          )}
        </Link>
      )}
      {renaming === null && (
        <button
          type="button"
          aria-label={`Actions for ${space.name}`}
          title="Rename, color, move, delete"
          aria-haspopup="menu"
          onClick={(event) => void openSpaceMenu(event, space.name, can, actions)}
          {...stylex.props(styles.more, shelf && styles.shelfMore)}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
        </button>
      )}
    </div>
  );
}

const styles = stylex.create({
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    height: "32px",
    minWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    fontSize: "14px",
    color: { default: color.inkSoft, ":hover": color.ink },
    userSelect: "none",
    transitionProperty: "color, background-color",
    transitionDuration: motion.micro,
  },
  // The sidebar's sliding pill is the fill.
  selected: {
    fontWeight: 600,
    backgroundColor: { default: "transparent", ":hover": "transparent" },
    color: { default: color.inkStrong, ":hover": color.inkStrong },
  },
  shelfRow: { height: "56px", borderRadius: radius.tile },
  shelfSelected: {
    fontWeight: 600,
    backgroundColor: { default: color.hover, ":hover": color.hover },
    boxShadow: `inset 0 0 0 1px ${color.borderStrong}`,
    color: { default: color.inkStrong, ":hover": color.inkStrong },
  },
  // Beside the count line, under the name.
  shelfMark: { left: "64px", top: "30px" },
  shelfName: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "center",
    gap: "3px",
    paddingLeft: "66px",
    paddingRight: "34px",
    borderRadius: radius.tile,
  },
  sub: {
    minHeight: "14px",
    paddingLeft: "19px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: "12px",
    lineHeight: "14px",
    fontWeight: 400,
    color: color.muted,
  },
  shelfText: { flexGrow: 0, lineHeight: "18px" },
  shelfMore: { top: "17px" },
  shelfRename: { marginLeft: "62px" },
  lifted: {
    zIndex: 1,
    backgroundColor: { default: color.hover, ":hover": color.hover },
    boxShadow: `0 6px 18px ${color.shadow}`,
    cursor: "grabbing",
  },
  lift: (offset: number) => ({ transform: `translateY(${offset}px)` }),
  // Over the link, on the same line as the mascot and every other sidebar icon.
  mark: {
    position: "absolute",
    left: "18px",
    top: "8px",
    display: "grid",
    placeItems: "center",
    width: "16px",
    height: "16px",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
    borderRadius: radius.round,
  },
  name: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexGrow: 1,
    minWidth: 0,
    height: "100%",
    // The link is the whole row, so a click anywhere opens the Space and focus rings the row.
    paddingLeft: "44px",
    paddingRight: "10px",
    color: "inherit",
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
    borderRadius: radius.control,
  },
  nameText: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  count: {
    width: "40px",
    flexShrink: 0,
    textAlign: "right",
    fontFamily: font.mono,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 400,
    color: color.muted,
    opacity: {
      default: 1,
      [stylex.when.ancestor(":hover", spaceRowMarker)]: 0,
      [stylex.when.ancestor(":has(:focus-visible)", spaceRowMarker)]: 0,
    },
  },
  // Over the count, shown on hover or keyboard focus, so revealing it lays nothing out.
  // Keyboard focus only: a clicked Space keeps focus, and its count must stay readable.
  more: {
    position: "absolute",
    right: "7px",
    top: "5px",
    display: "grid",
    placeItems: "center",
    width: "22px",
    height: "22px",
    padding: 0,
    borderWidth: 0,
    borderRadius: "6px",
    backgroundColor: { default: "transparent", ":hover": color.overlayActive },
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", spaceRowMarker)]: 1,
      [stylex.when.ancestor(":has(:focus-visible)", spaceRowMarker)]: 1,
    },
    transitionProperty: "opacity",
    transitionDuration: motion.micro,
  },
  rename: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: "26px",
    marginLeft: "44px",
    marginRight: "10px",
    paddingInline: "8px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.accent,
    borderRadius: "8px",
    backgroundColor: color.surface,
    color: color.ink,
    fontFamily: font.body,
    fontSize: "13px",
    outline: "none",
  },
});
