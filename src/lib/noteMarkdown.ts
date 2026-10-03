import type { Extensions, JSONContent } from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
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

export function parseNoteMarkdown(markdown: string): JSONContent {
  return markdownManager.parse(normalizeNoteBody(markdown));
}

export function serializeNoteDocument(document: JSONContent): string {
  return normalizeNoteBody(markdownManager.serialize(document));
}
