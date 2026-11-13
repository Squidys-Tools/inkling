import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { slidingSelection } from "./NavRow.tsx";
import { SpaceMark } from "./SpaceMark.tsx";
import { opensMenu, openSpaceMenu, type SpaceActions } from "./spaceMenu.ts";

/** The compact rail keeps each Space's cover, colored blot and the full row's actions. */
export function CompactSpaceRow({
  space,
  selected,
  cover,
  onBrokenCover,
  can,
  actions,
}: {
  space: Space;
  selected: boolean;
  cover: string | undefined;
  onBrokenCover: (url: string) => void;
  can: { up: boolean; down: boolean };
  actions: SpaceActions;
}) {
  return (
    <Link
      to="/space/$id"
      params={{ id: space.id }}
      draggable={false}
      data-space-id={space.id}
      data-glide={`space ${space.id}`}
      aria-label={space.name}
      title={space.name}
      aria-current={selected ? "page" : undefined}
      data-sidebar-selected={slidingSelection(selected)}
      onClick={() => search.clear()}
      onContextMenu={(event) => void openSpaceMenu(event, space.name, can, actions)}
      onKeyDown={(event) => {
        if (opensMenu(event)) void openSpaceMenu(event, space.name, can, actions);
      }}
      {...stylex.props(styles.row, selected && styles.selected)}
    >
      {cover && (
        <img
          src={cover}
          alt=""
          draggable={false}
          onError={() => onBrokenCover(cover)}
          {...stylex.props(styles.cover)}
        />
      )}
      <span {...stylex.props(cover !== undefined && styles.badge)}>
        <SpaceMark small={Boolean(cover)} color={space.color} hollow={space.kind === "smart"} />
      </span>
    </Link>
  );
}

const styles = stylex.create({
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    height: "36px",
    borderRadius: radius.control,
    textDecoration: "none",
    backgroundColor: { default: "transparent", ":hover": color.overlayHover },
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.94)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  // The open row's height, cover and badge spots, so closing the sidebar only crops each row.
  cover: {
    position: "absolute",
    left: "14px",
    top: "6px",
    width: "24px",
    height: "24px",
    borderRadius: "6px",
    objectFit: "cover",
    boxShadow: `0 0 0 1px ${color.border}`,
  },
  badge: {
    position: "absolute",
    zIndex: 1,
    left: "27px",
    top: "17px",
    display: "grid",
    placeItems: "center",
    width: "17px",
    height: "17px",
    borderRadius: radius.round,
    backgroundColor: color.window,
  },
  // The sidebar's sliding pill is the fill.
  selected: { backgroundColor: { default: "transparent", ":hover": "transparent" } },
});
