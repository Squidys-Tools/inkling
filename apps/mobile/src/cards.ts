import type { PhoneCard } from "./desktop";

export const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
};

export const cardTitle = (card: PhoneCard) =>
  card.title ??
  (card.sourceUrl ? hostname(card.sourceUrl) : (card.description?.split("\n")[0] ?? "Note"));

const units: Array<[string, number]> = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago"; Hermes lacks Intl.RelativeTimeFormat, so it is spelled out here. */
export function savedAgo(at: number, now = Date.now()) {
  const seconds = Math.max(0, (now - at) / 1000);
  for (const [unit, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** Desktop's quote attribution line: an em dash and the source. */
export function quoteAttribution(description: string | null) {
  const value = description?.trim() ?? "";
  if (!value) return "";
  return value.startsWith("—") ? value : `— ${value}`;
}

export const wordCount = (value: string | null) => {
  const words = value?.replace(/\s+/gu, " ").trim() ?? "";
  return words ? words.split(" ").length : 0;
};

export const fileExtension = (name: string | null) =>
  /\.([a-z0-9]{1,5})$/iu.exec(name?.trim() ?? "")?.[1]?.toUpperCase() ?? "";
