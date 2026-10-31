import { TextField } from "@inkling/ui";
import { useState } from "react";
import { looksLikeUrl, withScheme } from "../../capture/capture.ts";
import { AddFrame } from "./AddFrame.tsx";
import { drafts } from "./drafts.ts";
import { notAddress, useAddPage } from "./useAddPage.ts";

export function LinkForm() {
  const page = useAddPage();
  const [link, setLink] = useState(drafts.link);
  const update = (field: keyof typeof link) => (value: string) => {
    const next = { ...link, [field]: value };
    drafts.link = next;
    setLink(next);
  };
  const submit = () => {
    if (!looksLikeUrl(link.url.trim())) return page.reject(notAddress);
    page
      .save((client) =>
        client.captureUrl({
          sourceUrl: withScheme(link.url.trim()),
          captureSource: "quick link",
          title: link.title.trim() || undefined,
        }),
      )
      .then(
        (saved) => {
          if (saved) drafts.link = { url: "", title: "" };
        },
        // The frame shows the library's message.
        () => undefined,
      );
  };

  return (
    <AddFrame
      title="Save a link"
      error={page.error}
      saving={page.saving}
      canSave={Boolean(link.url.trim())}
      onSubmit={submit}
      onCancel={page.leave}
    >
      <TextField
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the page exists to take this link.
        autoFocus
        aria-label="URL to save"
        placeholder="Paste a link"
        inputMode="url"
        value={link.url}
        onChange={(event) => update("url")(event.target.value)}
      />
      <TextField
        aria-label="Title"
        placeholder="Title (optional)"
        value={link.title}
        onChange={(event) => update("title")(event.target.value)}
      />
    </AddFrame>
  );
}
