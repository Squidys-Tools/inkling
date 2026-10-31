// The backend's addTag normalizes the same way (electron/storage/items.ts).
export function tagToAdd(tags: string[], input: string) {
  const tag = input.trim().replace(/^#+/u, "").trim().toLowerCase();
  if (!tag || tags.some((existing) => existing.toLowerCase() === tag)) return null;
  return tag;
}
