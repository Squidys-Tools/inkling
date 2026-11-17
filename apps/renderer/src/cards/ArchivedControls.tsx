import Delete02Icon from "@hugeicons/core-free-icons/Delete02Icon";
import RotateLeft01Icon from "@hugeicons/core-free-icons/RotateLeft01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import type { CardView } from "../library/cardModel.ts";
import { cardMarker } from "../markers.stylex.ts";
import { deleteForever, setArchived } from "./cardActions.ts";

/** When an archived card was put away, with Restore and Delete, shown on hover or focus. */
export function ArchivedControls({ view }: { view: CardView }) {
  return (
    <div {...stylex.props(styles.layer)}>
      {view.archivedLabel && <span {...stylex.props(styles.when)}>{view.archivedLabel}</span>}
      <div {...stylex.props(styles.actions)}>
        <button
          type="button"
          title="Restore to library"
          onClick={() => void setArchived(view.id, false)}
          {...stylex.props(styles.restore)}
        >
          <HugeiconsIcon icon={RotateLeft01Icon} size={12} />
          Restore
        </button>
        <button
          type="button"
          aria-label={`Delete ${view.title}`}
          title="Delete permanently"
          onClick={() => void deleteForever(view)}
          {...stylex.props(styles.delete)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} />
        </button>
      </div>
    </div>
  );
}

const styles = stylex.create({
  // Over the card, and lifted with it. The cell's bottom 12px is the gap below the card.
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: "12px",
    zIndex: 4,
    pointerEvents: "none",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", cardMarker)]: 1,
      [stylex.when.ancestor(":focus-within", cardMarker)]: 1,
    },
    transform: {
      default: "none",
      [stylex.when.ancestor(":hover", cardMarker)]: "translateY(-2px)",
    },
    transitionProperty: "opacity, transform",
    transitionDuration: motion.micro,
    transitionTimingFunction: motion.standard,
  },
  when: {
    position: "absolute",
    top: "8px",
    left: "8px",
    maxWidth: "calc(100% - 16px)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    paddingBlock: "4px",
    paddingInline: "8px",
    borderRadius: radius.round,
    backgroundColor: cardColor.tileButton,
    color: color.ink,
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: "14px",
  },
  actions: {
    position: "absolute",
    right: "8px",
    bottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    pointerEvents: "auto",
  },
  restore: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    paddingInline: "12px",
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: color.ink,
    color: color.surface,
    fontFamily: font.body,
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 600,
    whiteSpace: "nowrap",
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
  delete: {
    display: "grid",
    placeItems: "center",
    width: "28px",
    height: "28px",
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: { default: cardColor.tileButton, ":hover": cardColor.deleteHover },
    color: { default: color.ink, ":hover": cardColor.deleteInkHover },
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    outline: { default: "none", ":focus-visible": `2px solid ${color.accent}` },
    outlineOffset: "2px",
  },
});
