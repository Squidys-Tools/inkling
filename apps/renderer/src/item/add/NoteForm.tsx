import { looksLikeUrl, withScheme } from "../../capture/capture.ts";
import { NoteEditor } from "../../editor/NoteEditor.tsx";
import { drafts } from "./drafts.ts";
import { useAddPage } from "./useAddPage.ts";

export function NoteForm() {
  const page = useAddPage();
  return (
    <NoteEditor
      kicker="New note"
      initialMarkdown={drafts.note}
      placeholder="A thought, a small beginning…"
      saveLabel="Save to library"
      onChange={(markdown) => {
        drafts.note = markdown;
      }}
      onCancel={page.leave}
      onSave={async ({ markdown, text }) => {
        // A note that is only a link is saved as the link, as pasting one is.
        const saved = await page.save((client) =>
          looksLikeUrl(text)
            ? client.captureUrl({ sourceUrl: withScheme(text), captureSource: "quick note" })
            : client.createNote({ body: markdown, metadata: { captureSource: "quick note" } }),
        );
        if (saved) drafts.note = "";
      }}
    />
  );
}
