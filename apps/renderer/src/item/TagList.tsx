import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import PlusSignIcon from "@hugeicons/core-free-icons/PlusSignIcon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useRef, useState } from "react";
import { tagMarker } from "../markers.stylex.ts";
import { SpaceSwatch } from "../shell/SpaceCover.tsx";

/** The Regular Spaces the item is filed in as chips, then its tags as text, and a field to add more. */
export function TagList({
  tags,
  spaces,
  onAddTag,
  onRemoveTag,
}: {
  tags: readonly string[];
  spaces: readonly Space[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  // Enter and Escape unmount the field, and Chromium may then send it a blur.
  const closed = useRef(false);
  const returnFocus = useRef(false);

  const add = (value: string) => {
    const tag = value.trim().replace(/^#+/u, "").trim();
    if (tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()))
      onAddTag(tag);
  };
  const close = (toButton: boolean) => {
    closed.current = true;
    returnFocus.current = toButton;
    setDraft(null);
  };

  return (
    <ul aria-label="Spaces and tags" {...stylex.props(styles.list)}>
      {spaces.map((filed) => (
        <li key={filed.id} {...stylex.props(styles.filed)}>
          <SpaceSwatch space={filed} />
          <span {...stylex.props(styles.name)}>{filed.name}</span>
        </li>
      ))}
      {tags.map((tag) => (
        <li key={tag} {...stylex.props(styles.tag)}>
          <span {...stylex.props(styles.name)}>
            <span aria-hidden="true" {...stylex.props(styles.hash)}>
              #
            </span>
            {tag}
          </span>
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            title="Remove tag"
            onClick={() => {
              onRemoveTag(tag);
              // The button is about to go; keep the keyboard's place in the row.
              addButton.current?.focus();
            }}
            {...stylex.props(styles.remove, tagMarker)}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.4} />
          </button>
        </li>
      ))}
      <li {...stylex.props(styles.item)}>
        {draft === null ? (
          <button
            ref={(node) => {
              addButton.current = node;
              if (node && returnFocus.current) node.focus();
              returnFocus.current = false;
            }}
            type="button"
            onClick={() => {
              closed.current = false;
              setDraft("");
            }}
            {...stylex.props(styles.add)}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={11} />
            Add tag
          </button>
        ) : (
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the add button the user just pressed.
            autoFocus
            value={draft}
            spellCheck={false}
            placeholder="Tag name"
            aria-label="New tag name"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              if (closed.current) return;
              add(draft);
              close(false);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key !== "Enter" && event.key !== "Escape") return;
              // Escape here cancels the edit, not the page.
              event.preventDefault();
              if (event.key === "Escape" || !draft.trim()) return close(true);
              // Enter keeps the field open for the next tag.
              add(draft);
              setDraft("");
            }}
            {...stylex.props(styles.input)}
          />
        )}
      </li>
    </ul>
  );
}

const focusRing = { default: "none", ":focus-visible": `2px solid ${color.accent}` };
const styles = stylex.create({
  list: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: "12px",
    rowGap: "6px",
    margin: 0,
    padding: 0,
    listStyleType: "none",
    fontFamily: font.body,
    fontSize: text.md,
    lineHeight: "16px",
  },
  item: { display: "flex", maxWidth: "100%" },
  filed: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    maxWidth: "100%",
    height: "26px",
    paddingLeft: "8px",
    paddingRight: "10px",
    borderRadius: radius.round,
    backgroundColor: color.raised,
    fontSize: text.sm,
    color: color.ink,
  },
  // A tag is plain text so a long list stays light. Keyboard focus on its remove
  // button washes the whole tag; the margins cancel the padding that wash needs.
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
    maxWidth: "100%",
    paddingBlock: "3px",
    paddingLeft: "7px",
    paddingRight: "3px",
    marginBlock: "-3px",
    marginLeft: "-7px",
    marginRight: "-3px",
    borderRadius: radius.round,
    backgroundColor: {
      default: "transparent",
      [stylex.when.descendant(":focus-visible", tagMarker)]: color.hover,
    },
    color: {
      default: itemColor.tagInk,
      [stylex.when.descendant(":focus-visible", tagMarker)]: color.ink,
    },
  },
  name: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  hash: { color: color.faint },
  remove: {
    display: "grid",
    flexShrink: 0,
    placeItems: "center",
    width: "16px",
    height: "16px",
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.round,
    backgroundColor: "transparent",
    color: { default: color.faint, ":hover": color.ink, ":focus-visible": color.ink },
    cursor: "pointer",
    outline: "none",
  },
  add: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.s1,
    padding: 0,
    borderWidth: 0,
    borderRadius: "4px",
    backgroundColor: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
    outline: focusRing,
    outlineOffset: "3px",
  },
  input: {
    boxSizing: "border-box",
    width: "132px",
    height: "26px",
    paddingInline: "10px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.focusRing,
    borderRadius: radius.round,
    backgroundColor: color.sunken,
    fontFamily: "inherit",
    fontSize: text.sm,
    color: color.ink,
    outline: "none",
    "::placeholder": { color: color.faint },
  },
});
