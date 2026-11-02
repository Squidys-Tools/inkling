// A title is one line: pasted or typed line breaks become spaces.
export function singleLine(value: string) {
  return value.replace(/\s*[\r\n]+\s*/gu, " ");
}

/** Reject overflowing edits before they can remove the existing filename suffix. */
export function fitsTitleEdit(length: number, start: number, end: number, inserted: string) {
  return length - (end - start) + inserted.length <= 500;
}

/** Where the name ends and a file extension (".webm") begins, or the end when there is none. */
export function nameEnd(title: string) {
  const dot = title.lastIndexOf(".");
  return dot > 0 && /^\.[\p{L}\p{N}]{1,10}$/u.test(title.slice(dot)) ? dot : title.length;
}
