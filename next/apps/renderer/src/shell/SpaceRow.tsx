import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Edit01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import { desktop } from "../desktop.ts";
import { search } from "../library/search.ts";
import { deleteSpace, moveSpace, recolorSpace, renameSpace } from "../library/spaces.ts";
import { spaceRowMarker } from "../markers.stylex.ts";
import { SpaceMark } from "./SpaceMark.tsx";

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
}: {
  space: Space;
  selected: boolean;
  count: number | undefined;
}) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState<string | null>(null);

  const commit = async (draft: string) => {
    setRenaming(null);
    // A failed rename reopens the field with what was typed, so nothing is lost.
    if (!(await renameSpace(space, draft))) setRenaming(draft);
  };

  return (
    <div {...stylex.props(styles.row, selected && styles.selected, spaceRowMarker)}>
      <button
        type="button"
        aria-label={`Change color of ${space.name}`}
        title={`Change color (now ${space.color})`}
        onClick={() => void recolorSpace(space)}
        {...stylex.props(styles.mark)}
      >
        <SpaceMark color={space.color} />
      </button>
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
            if (event.key === "Enter") void commit(renaming);
            else if (event.key === "Escape") setRenaming(null);
          }}
          // Blur keeps what was typed, like renaming in a file manager.
          onBlur={() => void commit(renaming)}
          {...stylex.props(styles.rename)}
        />
      ) : (
        <Link
          to="/space/$id"
          params={{ id: space.id }}
          onClick={() => search.clear()}
          aria-current={selected ? "page" : undefined}
          {...stylex.props(styles.name)}
        >
          <span {...stylex.props(styles.nameText)}>{space.name}</span>
          <span {...stylex.props(styles.count)}>{count?.toLocaleString()}</span>
        </Link>
      )}
      {renaming === null && (
        <span {...stylex.props(styles.tools)}>
          <Tool
            label={`Move ${space.name} up`}
            icon={ArrowUp01Icon}
            onSelect={() => void moveSpace(space, -1)}
          />
          <Tool
            label={`Move ${space.name} down`}
            icon={ArrowDown01Icon}
            onSelect={() => void moveSpace(space, 1)}
          />
          <Tool
            label={`Rename ${space.name}`}
            icon={Edit01Icon}
            onSelect={() => setRenaming(space.name)}
          />
          <Tool
            label={`Delete ${space.name}`}
            icon={Cancel01Icon}
            danger
            onSelect={async () => {
              if (!(await confirmDelete(space))) return;
              if ((await deleteSpace(space)) && selected) void navigate({ to: "/" });
            }}
          />
        </span>
      )}
    </div>
  );
}

function Tool({
  label,
  icon,
  danger = false,
  onSelect,
}: {
  label: string;
  icon: IconSvgElement;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      {...stylex.props(styles.tool, danger && styles.danger)}
    >
      <HugeiconsIcon icon={icon} size={12} />
    </button>
  );
}

const styles = stylex.create({
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    height: "32px",
    minWidth: 0,
    paddingInline: "10px",
    borderRadius: radius.control,
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    fontSize: "14px",
    color: { default: color.inkSoft, ":hover": color.ink },
    transitionProperty: "color, background-color",
    transitionDuration: motion.micro,
  },
  selected: { fontWeight: 600, color: { default: color.inkStrong, ":hover": color.inkStrong } },
  mark: {
    display: "grid",
    placeItems: "center",
    width: "16px",
    height: "16px",
    flexShrink: 0,
    marginRight: "10px",
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
    color: "inherit",
    textDecoration: "none",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
    borderRadius: "6px",
    // Room for the tools, which cover the count and a little of the name.
    paddingRight: {
      default: 0,
      [stylex.when.ancestor(":hover", spaceRowMarker)]: "34px",
      [stylex.when.ancestor(":focus-within", spaceRowMarker)]: "34px",
    },
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
      [stylex.when.ancestor(":focus-within", spaceRowMarker)]: 0,
    },
  },
  // Over the count, shown on hover or keyboard focus, so revealing them lays nothing out.
  tools: {
    position: "absolute",
    right: "8px",
    top: 0,
    bottom: 0,
    display: "flex",
    alignItems: "center",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", spaceRowMarker)]: 1,
      [stylex.when.ancestor(":focus-within", spaceRowMarker)]: 1,
    },
    transitionProperty: "opacity",
    transitionDuration: motion.micro,
  },
  tool: {
    display: "grid",
    placeItems: "center",
    padding: "3px",
    borderWidth: 0,
    borderRadius: "5px",
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
  },
  danger: { color: { default: color.muted, ":hover": cardColor.dangerTool } },
  rename: {
    flexGrow: 1,
    minWidth: 0,
    minHeight: "26px",
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
