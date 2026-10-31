import { decodeHTMLStrict } from "entities";

const VOID_HTML_TAGS = new Set(["br", "hr", "img", "input"]);

// A void tag ends a line, so `foo<br>bar` must not come back as `foobar`. An
// inline wrapper such as `<em>` marks up one run and must not split it, and a
// word-internal hint like `<wbr>` is a break opportunity, not a boundary. A
// block-level tag separates blocks, so it is a boundary the way a void tag is.
const BLOCK_HTML_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hgroup",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function htmlTagName(raw: string): string {
  return (
    raw
      .trim()
      .replace(/^<+/u, "")
      .replace(/^\/+/u, "")
      .match(/^[a-z][\w-]*/iu)?.[0]
      .toLocaleLowerCase() ?? ""
  );
}

// A tag is a word boundary when the document put words on either side of it;
// every other tag is markup around one run and contributes nothing.
function htmlTagBoundary(raw: string): string {
  const name = htmlTagName(raw);
  return VOID_HTML_TAGS.has(name) || BLOCK_HTML_TAGS.has(name) ? " " : "";
}

// CommonMark recognises a raw tag for inline parsing, and anything else is
// literal text, so a `<` that does not open a tag survives with the words
// around it.
function looksLikeTagStart(value: string): boolean {
  return /^<\/?[a-zA-Z]/u.test(value) || /^<![a-zA-Z]/u.test(value) || /^<\?/u.test(value);
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
    const rest = value.slice(opening);
    const comment = rest.match(/^<!--[\s\S]*?-->/u);
    if (comment) {
      result += value.slice(cursor, opening);
      cursor = opening + comment[0].length;
      continue;
    }
    // An autolink unwraps to its inner text, so the URL the user wrote survives.
    const autolink = rest.match(/^<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\s]*)>/u);
    if (autolink) {
      result += value.slice(cursor, opening) + autolink[1];
      cursor = opening + autolink[0].length;
      continue;
    }
    const emailAutolink = rest.match(/^<([^<>\s@]+@[^<>\s@]+)>/u);
    if (emailAutolink) {
      result += value.slice(cursor, opening) + emailAutolink[1];
      cursor = opening + emailAutolink[0].length;
      continue;
    }
    if (!looksLikeTagStart(rest)) {
      result += value.slice(cursor, opening + 1);
      cursor = opening + 1;
      continue;
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

// Intraword `_` is literal in CommonMark in any script (`é_foo_é` is one word),
// so the guard must recognize non-ASCII letters. Star emphasis has no guard.
function stripUnderscoreEmphasis(value: string, marker: string): string {
  return value.replace(
    new RegExp(`(${marker})(.*?)\\1`, "gu"),
    (match, _marker: string, inner: string, offset: number, whole: string) => {
      const before = offset > 0 ? whole[offset - 1] : "";
      const after = offset + match.length < whole.length ? whole[offset + match.length] : "";
      return /[\p{L}\p{N}_]/u.test(before) || /[\p{L}\p{N}_]/u.test(after) ? match : inner;
    },
  );
}

// Storage saves this as a note's description and the renderer shows it before the
// save returns, so both processes import this one function.
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
      .replace(/(\*\*\*)(.*?)\1/gu, "$2")
      .replace(/(\*\*)(.*?)\1/gu, "$2")
      .replace(/(\*)(.*?)\1/gu, "$2")
      .replace(/(~~)(.*?)\1/gu, "$2")
      .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
      .replace(/^\s*>\s?/gmu, "")
      .replace(/^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gmu, ""),
  );
  // Underscore emphasis and entity decoding run after tag stripping, so
  // decoded entities are never re-scanned as tags and underscore rules see
  // the same characters the tag pass saw.
  source = stripUnderscoreEmphasis(source, "___");
  source = stripUnderscoreEmphasis(source, "__");
  source = stripUnderscoreEmphasis(source, "_");
  // Strict decoding requires the closing semicolon, as CommonMark does, and maps
  // &#0; to U+FFFD, so an entity cannot forge the \0N\0 code-span placeholder.
  source = decodeHTMLStrict(source);
  source = source
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/ ([.,;!?])/gu, "$1");
  return source.replace(/\x00(\d+)\x00/gu, (_, index: string) => code[Number(index)] ?? "");
}
