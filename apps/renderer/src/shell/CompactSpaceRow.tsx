import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { slidingSelection } from "./NavRow.tsx";
import { SpaceMark } from "./SpaceMark.tsx";
import { opensMenu, openSpaceMenu, type SpaceActions } from "./spaceMenu.ts";

/** The compact rail keeps each Space's colored blot and the full row's actions. */
export function CompactSpaceRow({
  space,
  selected,
  can,
  actions,
}: {
  space: Space;
  selected: boolean;
  can: { up: boolean; down: boolean };
  actions: SpaceActions;
}) {
  return (
    <Link
      to="/space/$id"
      params={{ id: space.id }}
      draggable={false}
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
      <SpaceMark color={space.color} hollow={space.kind === "smart"} />
    </Link>
  );
}

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    height: "32px",
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
  // The sidebar's sliding pill is the fill.
  selected: { backgroundColor: { default: "transparent", ":hover": "transparent" } },
});
