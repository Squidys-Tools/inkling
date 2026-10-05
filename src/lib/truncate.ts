// Truncate by code point. `String.slice` cuts on UTF-16 units, so a limit that
// lands between the halves of an astral character (an emoji in a title, a rare
// CJK glyph in a selection) stores a lone surrogate and renders as a replacement
// character.
//
// Every user-facing string we cut to length needs this rather than `slice`.
export function truncate(value: string, max: number): string {
  const codePoints = Array.from(value);
  return codePoints.length > max ? codePoints.slice(0, max).join("") : value;
}