import type { Ref } from "react";
import { isSafeNoteLink } from "../../lib/notes";
import "./NoteLinkPopover.css";

export function NoteLinkPopover({
  ref,
  draft,
  canRemove,
  onDraftChange,
  onApply,
  onRemove,
}: {
  ref: Ref<HTMLInputElement>;
  draft: string;
  canRemove: boolean;
  /** null closes the popover. */
  onDraftChange: (draft: string | null) => void;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="note-link-popover" aria-label="Link">
      <input
        ref={ref}
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
