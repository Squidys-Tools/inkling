export const NOTE_BODY_FORMAT = "md" as const;

export function normalizeNoteBody(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

// A stored note body repeats the item's title as its first heading, so the
// editor and the card show it once. Every read and write path splits it apart
// the same way, and `titleHeading` is `undefined` when the stored body does not
// open with the title, so a caller never re-attaches a heading it did not find.
function splitNoteBody(markdown: string, title: string) {
  const firstLineEnd = markdown.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? markdown : markdown.slice(0, firstLineEnd)).trim();
  const heading = firstLine.replace(/^#{1,6}\s+/u, "").trim();
  const normalizedTitle = title.trim().toLocaleLowerCase();
  const hasTitleHeading = normalizedTitle !== "" && heading.toLocaleLowerCase() === normalizedTitle;
  if (!hasTitleHeading) return { titleHeading: undefined, body: markdown };
  const body = firstLineEnd === -1 ? "" : markdown.slice(firstLineEnd).replace(/^\n+/u, "");
  return { titleHeading: firstLine, body };
}

export function noteBodyForEditor(markdown: string | undefined, title: string): string {
  return markdown === undefined ? "" : splitNoteBody(markdown, title).body;
}

export function noteBodyForStorage(
  markdown: string | undefined,
  title: string,
  editedBody: string,
): string {
  const normalizedBody = normalizeNoteBody(editedBody);
  // An emptied note has nothing to save. Re-attaching the title heading first
  // would leave a non-empty body that the editor refuses to reopen, that the
  // card indexes as nothing but a title, and that `update_item` rejects anyway,
  // so the emptiness is decided on what the user actually left behind.
  if (!normalizedBody) return "";
  if (markdown === undefined) return normalizedBody;
  const { titleHeading } = splitNoteBody(markdown, title);
  return titleHeading === undefined
    ? normalizedBody
    : normalizeNoteBody(`${titleHeading}\n\n${normalizedBody}`);
}

export { markdownToPlainText } from "./ingestion/markdown-text";

// A note link opens in the user's browser, so only real web URLs are storable;
// `javascript:` and data payloads never reach the stored Markdown.
export { isWebUrl as isSafeNoteLink } from "./ingestion/url";
