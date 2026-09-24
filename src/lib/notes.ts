export const NOTE_BODY_FORMAT = "md" as const;

export function normalizeNoteBody(value: string): string {
  return value.replace(/\r\n?/gu, "\n").trim();
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
    result += value.slice(cursor, opening);
    cursor = closing + 1;
  }
  return result;
}

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
  ).replace(/\s+/gu, " ").trim();
  return source.replace(/\u0000(\d+)\u0000/gu, (_, index: string) => code[Number(index)] ?? "");
}

export function noteBodyForPreview(markdown: string, title: string): string {
  const normalizedTitle = title.trim().toLocaleLowerCase();
  if (!normalizedTitle) return markdown;
  const firstLineEnd = markdown.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? markdown : markdown.slice(0, firstLineEnd)).trim();
  const heading = firstLine.replace(/^#{1,6}\s+/u, "").trim();
  if (heading.toLocaleLowerCase() !== normalizedTitle) return markdown;
  return firstLineEnd === -1 ? "" : markdown.slice(firstLineEnd).replace(/^\n+/u, "");
}

export function noteBodyForEditor(markdown: string | undefined, title: string): string {
  return markdown === undefined ? "" : noteBodyForPreview(markdown, title);
}

export function noteBodyForStorage(markdown: string | undefined, title: string, editedBody: string): string {
  const normalizedBody = normalizeNoteBody(editedBody);
  if (markdown === undefined) return normalizedBody;
  const firstLineEnd = markdown.indexOf("\n");
  const firstLine = (firstLineEnd === -1 ? markdown : markdown.slice(0, firstLineEnd)).trim();
  const heading = firstLine.replace(/^#{1,6}\s+/u, "").trim();
  if (heading.toLocaleLowerCase() !== title.trim().toLocaleLowerCase()) return normalizedBody;
  return normalizeNoteBody(`${firstLine}\n\n${normalizedBody}`);
}

export function noteDescription(value: string | undefined): string {
  return markdownToPlainText(value ?? "");
}
