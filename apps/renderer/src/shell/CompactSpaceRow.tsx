import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { railRow } from "./railRow.stylex.ts";
import { railSquare, SelectionFill } from "./NavRow.tsx";
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
      {...stylex.props(styles.row, railSquare, selected && styles.selected)}
    >
      {selected && <SelectionFill />}
      <SpaceCover space={space} thumbs={thumbs} glide={`cover ${space.id}`} style={styles.cover} />
    </Link>
  );
}

const styles = stylex.create({
  // Centered in the square with 5px around it; the open row's rail cover sits at the same spot.
  cover: { width: "30px", height: "30px" },
  row: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    height: railRow.height,
    borderRadius: radius.control,
    textDecoration: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": color.overlayHover,
      ":focus-visible": color.overlayHover,
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
