export const NOTE_BODY_FORMAT = "md" as const;

export function normalizeNoteBody(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
}

// Mirrors `is_void_tag` in `markdown_to_plain_text` (src-tauri/src/storage.rs).
const VOID_HTML_TAGS = new Set(["br", "hr", "img", "input"]);

// A void tag ends a line, so `foo<br>bar` must not come back as `foobar`. An
// inline wrapper such as `<em>` marks up one run and must not split it, and a
// word-internal hint like `<wbr>` is a break opportunity, not a boundary. A
// block-level tag separates blocks, so it is a boundary the way a void tag is.
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "blockquote", "body", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
  "hgroup", "html", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th",
  "thead", "tr", "ul",
]);

function htmlTagName(raw: string): string {
  return raw.trim().replace(/^<+/u, "").replace(/^\/+/u, "").match(/^[a-z][\w-]*/iu)?.[0].toLocaleLowerCase() ?? "";
}

// A tag is a word boundary when the document put words on either side of it;
// every other tag is markup around one run and contributes nothing.
function htmlTagBoundary(raw: string): string {
  const name = htmlTagName(raw);
  return VOID_HTML_TAGS.has(name) || BLOCK_HTML_TAGS.has(name) ? " " : "";
}

function stripHtmlTags(value: string): string {
  let result = "";
  let cursor = 0;
  while (cursor < value.length) {
    const opening = value.indexOf("<", cursor);
    if (opening === -1) {
      result += value.slice(cursor);
      break;
    }
    const closing = value.indexOf(">", opening + 1);
    if (closing === -1) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, opening) + htmlTagBoundary(value.slice(opening, closing + 1));
    cursor = closing + 1;
  }
  return result;
}

// Projects note Markdown to plain text. Only the preview build has no Rust side
// to defer to, so this is the second implementation of `markdown_to_plain_text`
// (src-tauri/src/storage.rs) and the two must be read together when either moves.
// It is deliberately not byte-identical to that function:
//   - Known divergence, to be fixed on the Rust side. `markdown_to_plain_text`
//     handles `Event::InlineHtml` but not `Event::Html`, and it only treats a
//     void tag as a boundary, so raw block-level HTML there contributes nothing
//     and joins the words on either side of it. A block tag counts as a boundary
//     here instead, so the two disagree for any note carrying one — until the
//     Rust half learns the same rule, a block-level HTML tag in a note means the
//     description Rust stored and the description this projection produces are
//     not the same string.
//   - Fenced and inline code are lifted out before any tag scanning and put
//     back verbatim, so markup written inside a code span survives instead of
//     being read as markup. `markdown_to_plain_text` has no such pass.
export function markdownToPlainText(markdown: string): string {
  const code: string[] = [];
  const protect = (value: string) => {
    const index = code.push(value) - 1;
    return `\u0000${index}\u0000`;
  };
  let source = markdown.replace(/```[\s\S]*?```/gu, (block) =>
    protect(block.replace(/^```[^\n]*\n?|\n?```$/gu, "")),
  );
  source = source.replace(/`([^`]+)`/gu, (_, value: string) => protect(value));
  source = stripHtmlTags(
    source
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
      .replace(/(\*\*\*|___)(.*?)\1/gu, "$2")
      .replace(/(\*\*|__)(.*?)\1/gu, "$2")
      .replace(/(\*|_)(.*?)\1/gu, "$2")
      .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
      .replace(/^\s*>\s?/gmu, "")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gmu, ""),
  )
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/ ([.,;!?])/gu, "$1");
  return source.replace(/\u0000(\d+)\u0000/gu, (_, index: string) => code[Number(index)] ?? "");
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

export function noteBodyForPreview(markdown: string, title: string): string {
  return splitNoteBody(markdown, title).body;
}

export function noteBodyForEditor(markdown: string | undefined, title: string): string {
  return markdown === undefined ? "" : noteBodyForPreview(markdown, title);
}

export function noteBodyForStorage(markdown: string | undefined, title: string, editedBody: string): string {
  const normalizedBody = normalizeNoteBody(editedBody);
  // An emptied note has nothing to save. Re-attaching the title heading first
  // would leave a non-empty body that the editor refuses to reopen, that the
  // card indexes as nothing but a title, and that `update_item` rejects anyway,
  // so the emptiness is decided on what the user actually left behind.
  if (!normalizedBody) return "";
  if (markdown === undefined) return normalizedBody;
  const { titleHeading } = splitNoteBody(markdown, title);
  return titleHeading === undefined ? normalizedBody : normalizeNoteBody(`${titleHeading}\n\n${normalizedBody}`);
}

// A note link opens in the user's browser, so only real web URLs are storable.
// Everything else, including `javascript:` and data payloads, is refused here
// before it can reach the stored Markdown.
export function isSafeNoteLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
