import { GridViewIcon, ListViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, motion, radius } from "@inkling/ui/tokens.stylex";
import { setListMode, useViewState } from "./viewState.ts";

/** The grid and list switch at the bottom of the frame. */
export function ViewDock() {
  const list = useViewState((state) => state.list);
  return (
    <Glass style={styles.dock} role="group" aria-label="View options">
      <span {...stylex.props(styles.thumb, list && styles.thumbList)} aria-hidden="true" />
      <ViewButton
        label="Grid view"
        icon={GridViewIcon}
        selected={!list}
        onClick={() => setListMode(false)}
      />
      <ViewButton
        label="List view"
        icon={ListViewIcon}
        selected={list}
        onClick={() => setListMode(true)}
      />
    </Glass>
  );
}

function ViewButton({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      {...stylex.props(styles.button, selected && styles.selected)}
    >
      <HugeiconsIcon icon={icon} size={15} />
    </button>
  );
}

const styles = stylex.create({
  dock: {
    position: "absolute",
    left: "50%",
    bottom: "16px",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: "2px",
    height: "34px",
    padding: "3px",
    boxSizing: "border-box",
    borderRadius: radius.round,
    transform: "translateX(-50%)",
  },
  thumb: {
    position: "absolute",
    top: "3px",
    left: "3px",
    width: "26px",
    height: "26px",
    borderRadius: radius.round,
    backgroundColor: color.overlayActive,
    transitionProperty: "transform",
    transitionDuration: motion.delight,
    transitionTimingFunction: "cubic-bezier(0.77, 0, 0.175, 1)",
    pointerEvents: "none",
  },
  thumbList: { transform: "translateX(28px)" },
  button: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    placeItems: "center",
    width: "26px",
    height: "26px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: "transparent",
    color: color.muted,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "1px",
  },
  selected: { color: color.ink },
});
