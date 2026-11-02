import { GridViewIcon, ListViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Glass } from "@inkling/ui";
import * as stylex from "@stylexjs/stylex";
import { color, font, motion, radius, text } from "@inkling/ui/tokens.stylex";
import { useAppearance } from "../settings/appearance.ts";
import { useViewState } from "./viewState.ts";
import { switchView } from "./viewTransition.ts";

/** Both looks share the same view state and switch action. */
export function ViewDock() {
  const list = useViewState((state) => state.list);
  const segmented = useAppearance().viewToggle === "segmented";
  return (
    <Glass
      style={[styles.dock, segmented && styles.segmented]}
      role="group"
      aria-label="View options"
    >
      <span
        {...stylex.props(
          styles.thumb,
          segmented && styles.segmentedThumb,
          list && (segmented ? styles.segmentedList : styles.thumbList),
        )}
        aria-hidden="true"
      />
      <ViewButton
        label="Grid view"
        icon={GridViewIcon}
        selected={!list}
        segmented={segmented}
        onClick={() => switchView(false)}
      />
      <ViewButton
        label="List view"
        icon={ListViewIcon}
        selected={list}
        segmented={segmented}
        onClick={() => switchView(true)}
      />
    </Glass>
  );
}

function ViewButton({
  label,
  icon,
  selected,
  segmented,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  selected: boolean;
  segmented: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      onClick={onClick}
      {...stylex.props(
        styles.button,
        segmented && styles.segmentedButton,
        selected && styles.selected,
      )}
    >
      <HugeiconsIcon icon={icon} size={15} />
      {segmented && <span>{label === "Grid view" ? "Grid" : "List"}</span>}
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
  segmented: { borderRadius: radius.control, height: "38px" },
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
  segmentedThumb: { width: "72px", height: "30px", borderRadius: radius.control },
  thumbList: { transform: "translateX(28px)" },
  segmentedList: { transform: "translateX(74px)" },
  button: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
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
  segmentedButton: {
    width: "72px",
    height: "30px",
    borderRadius: radius.control,
    fontFamily: font.body,
    fontSize: text.sm,
    fontWeight: 500,
  },
  selected: { color: color.ink },
});
