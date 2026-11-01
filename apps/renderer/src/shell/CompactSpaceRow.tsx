import type { ContextMenuItem } from "@inkling/contracts/desktop";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { KeyboardEvent, MouseEvent } from "react";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { search } from "../library/search.ts";
import { menuPoint, showContextMenu } from "../menu/contextMenu.tsx";
import { SpaceMark } from "./SpaceMark.tsx";

type Actions = {
  up: () => void;
  down: () => void;
  color: () => void;
  rename: () => void;
  delete: () => void;
};

/** The compact rail keeps each Space's colored blot and the full row's actions. */
export function CompactSpaceRow({
  space,
  selected,
  canMoveUp,
  canMoveDown,
  actions,
}: {
  space: Space;
  selected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  actions: Actions;
}) {
  const menu = async (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    const entries: ContextMenuItem[] = [
      { type: "item", id: "up", label: "Move up", enabled: canMoveUp },
      { type: "item", id: "down", label: "Move down", enabled: canMoveDown },
      { type: "item", id: "color", label: "Change color" },
      { type: "item", id: "rename", label: "Rename" },
      { type: "separator" },
      { type: "item", id: "delete", label: "Delete Space", destructive: true },
    ];
    const target = event.currentTarget;
    const chosen = await showContextMenu(entries, menuPoint(event));
    if (target.isConnected && (!document.activeElement || document.activeElement === document.body))
      target.focus({ preventScroll: true });
    if (chosen && Object.hasOwn(actions, chosen)) actions[chosen as keyof Actions]();
  };
  return (
    <Link
      to="/space/$id"
      params={{ id: space.id }}
      aria-label={space.name}
      title={space.name}
      aria-current={selected ? "page" : undefined}
      onClick={() => search.clear()}
      onContextMenu={(event) => void menu(event)}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
          void menu(event);
      }}
      {...stylex.props(styles.row, selected && styles.selected)}
    >
      <SpaceMark color={space.color} />
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
    transform: { default: "none", ":active": "translateY(1px)" },
    transitionProperty: "background-color, transform",
    transitionDuration: motion.micro,
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "-2px",
  },
  selected: { backgroundColor: color.accentSoft },
});
