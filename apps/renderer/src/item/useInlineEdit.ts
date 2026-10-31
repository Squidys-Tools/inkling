import { type KeyboardEvent, useRef, useState } from "react";

/**
 * A field that stands in for a value while it is edited: Enter or leaving it
 * saves, Escape drops the edit. Enter and Escape unmount the field, and
 * Chromium may then send it a blur, so each edit settles exactly once.
 */
export function useInlineEdit(onSave: (value: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  const settled = useRef(false);
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    setDraft(null);
    if (save && draft !== null) onSave(draft);
  };
  return {
    draft,
    start: (value: string) => {
      settled.current = false;
      setDraft(value);
    },
    inputProps: {
      value: draft ?? "",
      onChange: (event: { currentTarget: HTMLInputElement }) => setDraft(event.currentTarget.value),
      onBlur: () => finish(true),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        // Escape here cancels the edit, not the page.
        event.preventDefault();
        finish(event.key === "Enter");
      },
    },
  };
}
