import { useLayoutEffect, useRef, useState } from "react";
import type { AddMode } from "./AddMenu";

export function useAddDrafts() {
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [quote, setQuote] = useState("");
  const [attribution, setAttribution] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  return {
    note,
    setNote,
    url,
    setUrl,
    quote,
    setQuote,
    attribution,
    setAttribution,
    sourceUrl,
    setSourceUrl,
  };
}

export function AddForm({
  mode,
  saving,
  drafts,
  onSubmit,
}: {
  mode: AddMode;
  saving: boolean;
  drafts: ReturnType<typeof useAddDrafts>;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true });
  }, []);
  return (
    <form ref={formRef} className="add-menu-form" onSubmit={onSubmit}>
      {mode === "note" && (
        <textarea
          value={drafts.note}
          onChange={(event) => drafts.setNote(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves; Shift+Enter starts a new line. An Enter that confirms
            // an IME composition only finishes the word.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="A thought, a small beginning…"
          aria-label="New note"
          rows={3}
        />
      )}
      {mode === "url" && (
        <input
          type="text"
          inputMode="url"
          value={drafts.url}
          onChange={(event) => drafts.setUrl(event.target.value)}
          placeholder="Paste a link"
          aria-label="URL to save"
        />
      )}
      {mode === "quote" && (
        <>
          <textarea
            value={drafts.quote}
            onChange={(event) => drafts.setQuote(event.target.value)}
            placeholder="“The mind is a place with weather…”"
            aria-label="Quote text"
            rows={3}
            maxLength={2000}
          />
          <input
            value={drafts.attribution}
            onChange={(event) => drafts.setAttribution(event.target.value)}
            placeholder="Attribution"
            aria-label="Quote attribution"
            maxLength={240}
          />
          <input
            type="text"
            inputMode="url"
            value={drafts.sourceUrl}
            onChange={(event) => drafts.setSourceUrl(event.target.value)}
            placeholder="Source URL (optional)"
            aria-label="Quote source URL"
          />
        </>
      )}
      <button className="add-menu-save" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save to library"}
      </button>
    </form>
  );
}
