import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
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
      <SpaceCover space={space} thumbs={thumbs} glide={`cover ${space.id}`} style={railCover} />
    </Link>
  );
}

// The open row's height, and its cover's center, so the swap to this row at the end of closing
// moves nothing. The open row takes this larger cover as soon as it starts closing.
export const { railCover } = stylex.create({
  railCover: { position: "absolute", left: "11px", top: "3px", width: "30px", height: "30px" },
});

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
