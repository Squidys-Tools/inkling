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

export function noteBodyForEditor(markdown: string, title: string): string {
  return splitNoteBody(markdown, title).body;
}

export function noteBodyForStorage(markdown: string, title: string, editedBody: string): string {
  const normalizedBody = normalizeNoteBody(editedBody);
  // An emptied note has nothing to save. Re-attaching the title heading first
  // would leave a body that is only a title, which the library refuses to index
  // as text, so emptiness is decided on what the user actually left behind.
  if (!normalizedBody) return "";
  const { titleHeading } = splitNoteBody(markdown, title);
  return titleHeading === undefined
    ? normalizedBody
    : normalizeNoteBody(`${titleHeading}\n\n${normalizedBody}`);
}

// A note link opens in the user's browser, so only web URLs are storable;
// `javascript:` and data payloads never reach the stored Markdown.
export { isWebUrl as isSafeNoteLink } from "@inkling/ingestion/url";
