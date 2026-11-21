import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { railRow } from "./railRow.stylex.ts";
import { SelectionFill } from "./NavRow.tsx";
import { SpaceCover } from "./SpaceCover.tsx";
import { opensMenu, openSpaceMenu, type SpaceActions } from "./spaceMenu.ts";

/** The compact rail keeps each Space's cover and the full row's actions. */
export function CompactSpaceRow({
  space,
  selected,
  thumbs,
  can,
  actions,
}: {
  space: Space;
  selected: boolean;
  thumbs: readonly string[];
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
      data-sidebar-nav
      aria-label={space.name}
      title={space.name}
      aria-current={selected ? "page" : undefined}
      onClick={() => search.clear()}
      onContextMenu={(event) => void openSpaceMenu(event, space.name, can, actions)}
      onKeyDown={(event) => {
        if (opensMenu(event)) void openSpaceMenu(event, space.name, can, actions);
      }}
      {...stylex.props(styles.row, selected && styles.selected)}
    >
      {selected && <SelectionFill />}
      <SpaceCover space={space} thumbs={thumbs} glide={`cover ${space.id}`} style={styles.cover} />
    </Link>
  );
}

const styles = stylex.create({
  // Centered in the 38px tile with 6px around it; the open row's rail cover sits at the same spot.
  cover: { width: "26px", height: "26px" },
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "38px",
    marginInline: "auto",
    height: railRow.height,
    borderRadius: radius.tile,
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayActive,
      ":focus-visible": color.overlayActive,
    },
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.94)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    outline: "none",
  },
  selected: {
    isolation: "isolate",
    backgroundColor: { default: "transparent", ":hover": "transparent" },
  },
});
