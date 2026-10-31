/* oxlint-disable jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions -- A tile holds its Restore and Delete buttons, so the article cannot be a button; Enter opens the focused tile. */
import { Delete02Icon, RotateLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import type { KeyboardEvent, MouseEvent } from "react";
import { cardColor, color, font, motion, radius } from "@inkling/ui/tokens.stylex";
import type { CardView } from "../library/cardModel.ts";
import { useProcessing } from "../library/jobs.ts";
import { menuPoint } from "../menu/contextMenu.tsx";
import { tileMarker } from "../markers.stylex.ts";
import { deleteForever, openCardMenu, openItem, setArchived } from "./cardActions.ts";
import { CardMedia } from "./CardMedia.tsx";
import { ProcessingBadge } from "./Processing.tsx";

/** An archived item: its media, title and kind, with Restore and Delete on hover or focus. */
export function ArchiveTile({ view, index }: { view: CardView; index: number }) {
  const navigate = useNavigate();
  const processing = useProcessing(view.id);
  const menu = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    void openCardMenu(view, menuPoint(event), navigate);
  };
  return (
    <div {...stylex.props(styles.cell)} data-library-index={index}>
      <article
        tabIndex={0}
        aria-label={`Archived ${view.kind}: ${view.title}`}
        data-bench="card"
        data-item-id={view.id}
        onClick={() => openItem(view, navigate)}
        onContextMenu={menu}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
            return menu(event);
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openItem(view, navigate);
        }}
        {...stylex.props(styles.tile, tileMarker)}
      >
        <div {...stylex.props(styles.media)}>
          <CardMedia view={view} layout="archive" priority={index < 12} />
          {processing && <ProcessingBadge processing={processing} />}
          <div {...stylex.props(styles.controls)}>
            <button
              type="button"
              title="Restore to library"
              onClick={(event) => {
                event.stopPropagation();
                void setArchived(view.id, false);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              {...stylex.props(styles.restore)}
            >
              <HugeiconsIcon icon={RotateLeft01Icon} size={12} />
              Restore
            </button>
            <button
              type="button"
              aria-label={`Delete ${view.title}`}
              title="Delete permanently"
              onClick={(event) => {
                event.stopPropagation();
                void deleteForever(view);
              }}
              onKeyDown={(event) => event.stopPropagation()}
              {...stylex.props(styles.delete)}
            >
              <HugeiconsIcon icon={Delete02Icon} size={13} />
            </button>
          </div>
        </div>
        <div {...stylex.props(styles.caption)}>
          <span {...stylex.props(styles.title)}>{view.title}</span>
          <span {...stylex.props(styles.meta)}>
            {view.kind} · {view.date}
          </span>
        </div>
      </article>
    </div>
  );
}

const styles = stylex.create({
  cell: { boxSizing: "border-box", minWidth: 0, paddingBottom: "18px" },
  tile: {
    display: "block",
    cursor: "pointer",
    outline: "none",
  },
  media: {
    position: "relative",
    height: "132px",
    overflow: "hidden",
    borderRadius: "10px",
    backgroundColor: color.surface,
    outlineWidth: "2px",
    outlineStyle: "solid",
    outlineOffset: "2px",
    outlineColor: {
      default: "transparent",
      [stylex.when.ancestor(":hover", tileMarker)]: color.ink,
      [stylex.when.ancestor(":focus-visible", tileMarker)]: color.accent,
    },
  },
  controls: {
    position: "absolute",
    right: "8px",
    bottom: "8px",
    zIndex: 4,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    opacity: {
      default: 0,
      [stylex.when.ancestor(":hover", tileMarker)]: 1,
      [stylex.when.ancestor(":focus-within", tileMarker)]: 1,
    },
    transitionProperty: "opacity",
    transitionDuration: motion.micro,
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
  caption: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
    marginTop: "9px",
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.body,
    fontSize: "13px",
    lineHeight: "17px",
    color: color.ink,
  },
  meta: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: font.mono,
    fontSize: "11px",
    lineHeight: "14px",
    color: cardColor.tileMeta,
  },
});
