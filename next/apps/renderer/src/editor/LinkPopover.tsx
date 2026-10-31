import * as stylex from "@stylexjs/stylex";
import { Button } from "@inkling/ui";
import { color, font, radius, space, text } from "@inkling/ui/tokens.stylex";
import { useLayoutEffect, useRef } from "react";
import { isSafeNoteLink } from "./notes.ts";

/** Edits the link under the selection. Only web URLs apply. */
export function LinkPopover({
  draft,
  canRemove,
  onDraftChange,
  onApply,
  onRemove,
}: {
  draft: string;
  canRemove: boolean;
  /** null closes the popover. */
  onDraftChange: (draft: string | null) => void;
  onApply: () => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Only on open: selecting on every change would replace the URL with each keystroke.
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <fieldset aria-label="Link" {...stylex.props(styles.popover)}>
      <input
        ref={inputRef}
        aria-label="Link URL"
        value={draft}
        placeholder="https://"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          } else if (event.key === "Escape") {
            // Escape closes the popover, not the page.
            event.preventDefault();
            onDraftChange(null);
          }
        }}
        {...stylex.props(styles.input)}
      />
      <Button
        variant="primary"
        style={styles.action}
        disabled={!isSafeNoteLink(draft.trim())}
        onClick={onApply}
      >
        Apply
      </Button>
      <Button style={styles.action} disabled={!canRemove} onClick={onRemove}>
        Remove
      </Button>
    </fieldset>
  );
}

const styles = stylex.create({
  popover: {
    position: "absolute",
    right: 0,
    bottom: "calc(100% + 8px)",
    zIndex: 2,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    margin: 0,
    padding: "7px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: color.borderStrong,
    borderRadius: "10px",
    backgroundColor: color.raised,
    boxShadow: `0 16px 34px ${color.shadow}`,
  },
  input: {
    width: "232px",
    paddingBlock: "7px",
    paddingInline: "9px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: { default: color.border, ":focus": color.muted },
    borderRadius: radius.control,
    backgroundColor: color.sunken,
    color: color.ink,
    fontFamily: font.body,
    fontSize: text.sm,
    outline: "none",
  },
  action: { height: "30px", paddingInline: space.s3, fontSize: text.sm },
});
