import { useLayoutEffect, useRef } from "react";
import { isSafeNoteLink } from "../../lib/notes";
import "./NoteLinkPopover.css";

export function NoteLinkPopover({
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
  // Only on open: selecting on every draft change would replace the URL with each keystroke.
  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <fieldset className="note-link-popover" aria-label="Link">
      <input
        ref={inputRef}
        className="note-link-input"
        aria-label="Link URL"
        value={draft}
        placeholder="https://"
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onApply();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onDraftChange(null);
          }
        }}
      />
      <button
        type="button"
        className="note-link-apply"
        aria-label="Apply link"
        disabled={!isSafeNoteLink(draft.trim())}
        onClick={onApply}
      >
        Apply
      </button>
      <button
        type="button"
        className="note-link-remove"
        aria-label="Remove link"
        disabled={!canRemove}
        onClick={onRemove}
      >
        Remove
      </button>
    </fieldset>
  );
}
