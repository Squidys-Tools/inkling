import * as stylex from "@stylexjs/stylex";
import { TextArea, TextField } from "@inkling/ui";
import { font, text } from "@inkling/ui/tokens.stylex";
import { useState } from "react";
import { looksLikeUrl, withScheme } from "../../capture/capture.ts";
import { AddFrame } from "./AddFrame.tsx";
import { drafts } from "./drafts.ts";
import { notAddress, useAddPage } from "./useAddPage.ts";

export function QuoteForm() {
  const page = useAddPage();
  const [quote, setQuote] = useState(drafts.quote);
  const update = (field: keyof typeof quote) => (value: string) => {
    const next = { ...quote, [field]: value };
    drafts.quote = next;
    setQuote(next);
  };
  const submit = () => {
    const sourceUrl = quote.sourceUrl.trim();
    if (sourceUrl && !looksLikeUrl(sourceUrl)) return page.reject(`for the source, ${notAddress}`);
    page
      .save((client) =>
        client.createQuote({
          body: quote.body.trim(),
          attribution: quote.attribution.trim() || undefined,
          sourceUrl: sourceUrl ? withScheme(sourceUrl) : undefined,
          metadata: { captureSource: "quick quote" },
        }),
      )
      .then(
        (saved) => {
          if (saved) drafts.quote = { body: "", attribution: "", sourceUrl: "" };
        },
        // The frame shows the library's message.
        () => undefined,
      );
  };

  return (
    <AddFrame
      title="New quote"
      error={page.error}
      saving={page.saving}
      canSave={Boolean(quote.body.trim())}
      onSubmit={submit}
      onCancel={page.leave}
    >
      <TextArea
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page exists to write this quote.
        autoFocus
        aria-label="Quote text"
        placeholder="“The mind is a place with weather…”"
        maxLength={2000}
        rows={6}
        value={quote.body}
        onChange={(event) => update("body")(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        style={styles.quote}
      />
      <TextField
        aria-label="Attribution"
        placeholder="Attribution"
        maxLength={240}
        value={quote.attribution}
        onChange={(event) => update("attribution")(event.target.value)}
      />
      <TextField
        aria-label="Source URL"
        placeholder="Source URL (optional)"
        inputMode="url"
        value={quote.sourceUrl}
        onChange={(event) => update("sourceUrl")(event.target.value)}
      />
    </AddFrame>
  );
}

const styles = stylex.create({
  quote: { fontFamily: font.quote, fontSize: text.lg, fontStyle: "italic", lineHeight: 1.6 },
});
