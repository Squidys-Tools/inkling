import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@inkling/ui";
import { color, space, text } from "@inkling/ui/tokens.stylex";
import type { MouseEvent, ReactNode } from "react";
import { desktop } from "../desktop.ts";
import { reportActionError } from "../cards/actionError.ts";
import { errorMessage } from "../library/errors.ts";
import { hostname } from "../library/assets.ts";
import { menuPoint, showContextMenu } from "../menu/contextMenu.tsx";
import type { DescribedItem } from "./model.ts";

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const glyphs = {
  space: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />,
  folder: (
    <>
      <path d="M3 18V7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1" />
      <path d="M3 18l2.6-6.4A2 2 0 0 1 7.5 10H21l-2.8 7.4A2 2 0 0 1 16.3 19H4a1 1 0 0 1-1-1z" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 12h4" />
    </>
  ),
  restore: <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />,
  delete: (
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  ),
};

/** A short word on the bar; the full action stays its accessible name and tooltip. */
function Action({
  label,
  word,
  glyph,
  style,
  onClick,
}: {
  label: string;
  word: string;
  glyph: ReactNode;
  style?: stylex.StyleXStyles;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      aria-label={label}
      title={label}
      icon={<Glyph>{glyph}</Glyph>}
      style={[styles.button, style]}
      onClick={onClick}
    >
      {word}
    </Button>
  );
}

/** The item's actions: file in a Space, open the original, show the file, archive or restore, delete. */
export function ActionBar({
  item,
  spaces,
  memberOf,
  onToggleSpace,
  onArchive,
  onRestore,
  onDelete,
}: {
  item: DescribedItem;
  spaces: readonly Space[];
  memberOf: readonly string[];
  onToggleSpace: (spaceId: string, filed: boolean) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const url = item.webUrl;
  const openLabel = `Open ${hostname(url) ?? "original"}`;
  // Filing in and taking out happen in one menu, so each Space offers whichever applies.
  const chooseSpace = async (point: { x: number; y: number }) => {
    const chosen = await showContextMenu(
      spaces.map((option) => ({
        type: "item" as const,
        id: option.id,
        label: memberOf.includes(option.id)
          ? `Remove from ${option.name}`
          : `Add to ${option.name}`,
      })),
      point,
    );
    if (chosen) onToggleSpace(chosen, !memberOf.includes(chosen));
  };

  return (
    <footer {...stylex.props(styles.bar)}>
      {!item.archived && spaces.length > 0 && (
        <Action
          label="Keep in a Space"
          word="Space"
          glyph={glyphs.space}
          onClick={(event) => void chooseSpace(menuPoint(event))}
        />
      )}
      {url && (
        <Action
          label={openLabel}
          word="Open"
          glyph={glyphs.open}
          onClick={() =>
            desktop
              ? void desktop.openExternal(url)
              : window.open(url, "_blank", "noopener,noreferrer")
          }
        />
      )}
      {desktop && item.hasFile && (
        <Action
          label="Show in folder"
          word="Folder"
          glyph={glyphs.folder}
          onClick={() =>
            void desktop
              ?.showItemInFolder(item.id)
              .catch((error: unknown) =>
                reportActionError(`Couldn’t show this file: ${errorMessage(error)}`),
              )
          }
        />
      )}
      {item.archived ? (
        <>
          <Action
            label="Restore to library"
            word="Restore"
            glyph={glyphs.restore}
            onClick={onRestore}
          />
          <Action
            label="Delete permanently"
            word="Delete"
            glyph={glyphs.delete}
            style={[styles.end, styles.danger]}
            onClick={onDelete}
          />
        </>
      ) : (
        <Action
          label="Archive"
          word="Archive"
          glyph={glyphs.archive}
          style={styles.end}
          onClick={onArchive}
        />
      )}
    </footer>
  );
}

const styles = stylex.create({
  bar: {
    position: "relative",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: "2px",
    height: "44px",
    marginTop: space.s3,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: color.border,
  },
  button: {
    gap: "6px",
    height: "28px",
    paddingInline: space.s2,
    fontSize: text.sm,
    color: { default: color.muted, ":hover": color.ink },
    // The first icon lines up with the panel's text; its hover wash reaches into the gutter.
    marginLeft: { default: 0, ":first-child": `calc(-1 * ${space.s2})` },
  },
  end: { marginLeft: "auto" },
  danger: { color: { default: color.muted, ":hover": color.danger } },
});
