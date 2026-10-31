import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, font, itemColor, radius, space, text } from "@inkling/ui/tokens.stylex";
import { SpaceMark } from "../shell/SpaceMark.tsx";
import { useInlineEdit } from "./useInlineEdit.ts";

/** The Regular Spaces the item is filed in, its tags, and a field to add one. */
export function TagList({
  tags,
  spaces,
  onAddTag,
}: {
  tags: readonly string[];
  spaces: readonly Space[];
  onAddTag: (tag: string) => void;
}) {
  const edit = useInlineEdit((value) => {
    const tag = value.trim().replace(/^#+/u, "").trim();
    if (tag && !tags.some((existing) => existing.toLowerCase() === tag.toLowerCase()))
      onAddTag(tag);
  });

  return (
    <div {...stylex.props(styles.list)}>
      {spaces.map((filed) => (
        <span key={filed.id} {...stylex.props(styles.space)}>
          <SpaceMark small color={filed.color} />
          {filed.name}
        </span>
      ))}
      {tags.map((tag) => (
        <span key={tag} {...stylex.props(styles.tag)}>
          #{tag}
        </span>
      ))}
      {edit.draft === null ? (
        <button
          type="button"
          aria-label="Add a tag"
          title="Add a tag"
          onClick={() => edit.start("")}
          {...stylex.props(styles.add)}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={11} />
        </button>
      ) : (
        <input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field replaces the add button the user just pressed.
          autoFocus
          placeholder="tag name"
          aria-label="New tag name"
          {...edit.inputProps}
          {...stylex.props(styles.input)}
        />
      )}
    </div>
  );
}

const styles = stylex.create({
  list: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: space.s3,
    rowGap: "6px",
  },
  space: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    maxWidth: "100%",
    height: "28px",
    paddingLeft: "9px",
    paddingRight: "10px",
    borderRadius: radius.round,
    backgroundColor: color.raised,
    fontSize: text.md,
    color: color.ink,
  },
  tag: { fontSize: text.md, lineHeight: "16px", color: itemColor.tagInk },
  add: {
    display: "grid",
    placeItems: "center",
    width: "24px",
    height: "24px",
    padding: 0,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: { default: color.borderStrong, ":hover": color.muted },
    borderRadius: radius.round,
    backgroundColor: "transparent",
    color: { default: color.muted, ":hover": color.ink },
    cursor: "pointer",
  },
  input: {
    width: "110px",
    paddingBlock: space.s1,
    paddingInline: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":focus": color.accent },
    borderRadius: "6px",
    backgroundColor: color.sunken,
    fontFamily: font.body,
    fontSize: text.sm,
    color: color.ink,
    outline: "none",
  },
});
