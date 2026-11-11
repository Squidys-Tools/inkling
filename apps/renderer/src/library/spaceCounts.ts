import { createAtom, useSelector } from "@tanstack/react-store";

const storageKey = "smart-space-counts";

/** Stored counts are read back as untrusted text: only whole, non-negative numbers survive. */
export function parseSpaceCounts(stored: string | null) {
  try {
    const value: unknown = JSON.parse(stored ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] => Number.isSafeInteger(entry[1]) && entry[1] >= 0,
      ),
    );
  } catch {
    return {};
  }
}

function readCounts() {
  try {
    return parseSpaceCounts(localStorage.getItem(storageKey));
  } catch {
    return {};
  }
}

const counts = createAtom(readCounts());

function store(next: Record<string, number>) {
  counts.set(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {}
}

/** A Smart Space is counted only when it is opened, so its row keeps the last count it showed. */
export function rememberSpaceCount(spaceId: string, total: number) {
  if (counts.get()[spaceId] !== total) store({ ...counts.get(), [spaceId]: total });
}

export function forgetSpaceCount(spaceId: string) {
  const { [spaceId]: gone, ...rest } = counts.get();
  if (gone !== undefined) store(rest);
}

export const useSpaceCounts = () => useSelector(counts);
