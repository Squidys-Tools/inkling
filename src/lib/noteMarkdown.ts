import { generateHTML, type Extensions, type JSONContent } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import { normalizeNoteBody } from "./notes";

export const noteEditorExtensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      markdownLinks: true,
      defaultProtocol: "https",
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    },
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  Markdown.configure({
    markedOptions: { gfm: true },
  }),
];

const markdownManager = new MarkdownManager({ extensions: noteEditorExtensions });

const allowedTags = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "a",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "input",
  "blockquote",
  "code",
  "pre",
  "hr",
];

const allowedAttributes = ["href", "target", "rel", "type", "checked", "disabled", "data-type", "data-checked"];

export function parseNoteMarkdown(markdown: string): JSONContent {
  return markdownManager.parse(normalizeNoteBody(markdown));
}

export function serializeNoteDocument(document: JSONContent): string {
  return normalizeNoteBody(markdownManager.serialize(document));
}

export function renderNoteMarkdown(markdown: string): string {
  const html = generateHTML(parseNoteMarkdown(markdown), noteEditorExtensions);
  const safeHtml = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    ALLOW_ARIA_ATTR: true,
  });
  return safeHtml.replace(/<input(?=[^>]*type="checkbox")(?![^>]*disabled)([^>]*)>/gu, "<input$1 disabled>");
}
