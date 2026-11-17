/* oxlint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- A click on the field's padding focuses its input, which has the keyboard already. */
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Space } from "@inkling/contracts";
import * as stylex from "@stylexjs/stylex";
import { color, font, itemColor, radius, text } from "@inkling/ui/tokens.stylex";
import { useId, useRef, useState } from "react";
import { tagMarker } from "../markers.stylex.ts";
import { SpaceSwatch } from "../shell/SpaceCover.tsx";
import { useTagCounts } from "./queries.ts";

const maxSuggestions = 5;

/** The Regular Spaces the item is filed in, then one field holding its tags that you type into. */
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
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const counts = useTagCounts(focused);

  const typed = draft.trim().replace(/^#+/u, "").trim();
  const has = (tag: string) =>
    tags.some((existing) => existing.toLowerCase() === tag.toLowerCase());
  const suggestions = typed ? suggest(counts.data ?? [], typed, has) : [];
  const open = focused && suggestions.length > 0;

  const add = (tag: string) => {
    if (tag && !has(tag)) onAddTag(tag);
    setDraft("");
    setActive(-1);
  };

  return (
    <div {...stylex.props(styles.stack)}>
      {spaces.length > 0 && (
        <p {...stylex.props(styles.spaces)}>
          <span {...stylex.props(styles.inLabel)}>In</span>
          {spaces.map((filed) => (
            <span key={filed.id} {...stylex.props(styles.space)}>
              <SpaceSwatch space={filed} />
              <span {...stylex.props(styles.name)}>{filed.name}</span>
            </span>
          ))}
        </p>
      )}
      <div
        role="group"
        aria-label="Tags"
        onClick={(event) => {
          if (event.target === event.currentTarget) input.current?.focus();
        }}
        {...stylex.props(styles.field)}
      >
        {tags.map((tag) => (
          <span key={tag} {...stylex.props(styles.token)}>
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
                // The button is about to go; keep the keyboard in the field.
                input.current?.focus();
              }}
              {...stylex.props(styles.remove, tagMarker)}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={draft}
          spellCheck={false}
          placeholder="Add a tag…"
          aria-label="Add a tag"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            add(typed);
          }}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActive((current) =>
                Math.max(-1, Math.min(suggestions.length - 1, current + step)),
              );
            } else if (event.key === "Enter") {
              // What was typed is the tag; a suggestion is used only when picked.
              event.preventDefault();
              add(open && active >= 0 ? suggestions[active].tag : typed);
            } else if (event.key === "Escape") {
              // Escape here clears or leaves the field, not the page.
              event.preventDefault();
              if (draft) {
                setDraft("");
                setActive(-1);
              } else input.current?.blur();
            }
          }}
          {...stylex.props(styles.input)}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tags you use"
          // Picking a suggestion must not blur the field first, which would add the draft.
          onPointerDown={(event) => event.preventDefault()}
          {...stylex.props(styles.suggestions)}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.tag}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onClick={() => add(suggestion.tag)}
              onPointerEnter={() => setActive(index)}
              {...stylex.props(styles.option, index === active && styles.optionActive)}
            >
              <span {...stylex.props(styles.name)}>
                <span aria-hidden="true" {...stylex.props(styles.hash)}>
                  #
                </span>
                {suggestion.tag}
              </span>
              <span {...stylex.props(styles.count)}>{suggestion.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tags that start with what was typed, then ones that contain it, leaving out the item's own. */
function suggest(
  counts: readonly { tag: string; count: number }[],
  typed: string,
  has: (tag: string) => boolean,
) {
  const wanted = typed.toLowerCase();
  const matches = counts.filter(
    (entry) => !has(entry.tag) && entry.tag.toLowerCase().includes(wanted),
  );
  const starts = matches.filter((entry) => entry.tag.toLowerCase().startsWith(wanted));
  return [...starts, ...matches.filter((entry) => !starts.includes(entry))].slice(
    0,
    maxSuggestions,
  );
}

const styles = stylex.create({
  stack: { position: "relative", display: "flex", flexDirection: "column", gap: "8px" },
  spaces: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "4px 10px",
    margin: 0,
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    color: color.inkSoft,
  },
  inLabel: { color: color.muted },
  space: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
    maxWidth: "100%",
  },
  field: {
    boxSizing: "border-box",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "5px",
    minHeight: "38px",
    padding: "6px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: color.border,
      ":hover": color.borderStrong,
      ":focus-within": color.focusRing,
    },
    borderRadius: "10px",
    backgroundColor: color.sunken,
    cursor: "text",
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
    transitionProperty: "border-color",
    transitionDuration: "120ms",
  },
  // Keyboard focus on a tag's remove button washes the whole token.
  token: {
    boxSizing: "border-box",
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    maxWidth: "100%",
    height: "24px",
    paddingLeft: "8px",
    paddingRight: "4px",
    borderRadius: "6px",
    backgroundColor: {
      default: color.raised,
      [stylex.when.descendant(":focus-visible", tagMarker)]: color.hover,
    },
    color: {
      default: itemColor.tagInk,
      [stylex.when.descendant(":focus-visible", tagMarker)]: color.ink,
    },
    cursor: "default",
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
  input: {
    flex: "1 1 80px",
    minWidth: "80px",
    height: "24px",
    padding: "0 4px",
    borderWidth: 0,
    backgroundColor: "transparent",
    fontFamily: "inherit",
    fontSize: "inherit",
    color: color.ink,
    outline: "none",
    "::placeholder": { color: color.faint },
  },
  suggestions: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    right: 0,
    zIndex: 5,
    margin: 0,
    padding: "4px",
    listStyleType: "none",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.border,
    borderRadius: "10px",
    backgroundColor: color.raised,
    boxShadow: `0 10px 24px ${color.shadow}`,
    fontFamily: font.body,
    fontSize: text.sm,
    lineHeight: "16px",
  },
  option: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    paddingBlock: "6px",
    paddingInline: "8px",
    borderRadius: "6px",
    color: color.inkSoft,
    cursor: "pointer",
  },
  optionActive: { backgroundColor: color.hover, color: color.ink },
  count: { flexShrink: 0, fontFamily: font.mono, fontSize: "11px", color: color.faint },
});
