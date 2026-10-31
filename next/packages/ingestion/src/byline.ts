import { normalizePublishedDate, normalizeText } from "./url.ts";

const BYLINE_SELECTOR = [
  '[rel="author"]',
  '[itemprop="author"]',
  '[class*="byline"]',
  '[class*="byLine"]',
  '[class*="author"]',
  '[class*="writer"]',
].join(", ");

const BYLINE_PREFIXES = /^(?:by|written by|recipe by|words by|story by|text by)\b/i;

const BYLINE_TIME_TEXT_PREFIX = /^on\s+/i;

type VisibleByline = { author: string; publishedDate: string | null };

export function visibleByline(document: Document): VisibleByline {
  const heading = document.querySelector("h1");
  if (!heading) return { author: "", publishedDate: null };

  let start: Element | null = heading;
  for (let climbs = 0; start && !start.nextElementSibling && climbs < 2; climbs += 1) {
    start = start.parentElement;
    if (!start || start === document.body) return { author: "", publishedDate: null };
  }

  let node: Element | null = start?.nextElementSibling ?? null;
  for (let hops = 0; node && hops < 4; hops += 1, node = node.nextElementSibling) {
    const text = normalizeText(node.textContent);
    if (!text || !BYLINE_PREFIXES.test(text)) continue;

    const anchors = [...node.querySelectorAll("a")].map((anchor) =>
      normalizeText(anchor.textContent),
    );
    const author = bylineAuthorText(text, anchors);

    const time = node.querySelector("time");
    const datetime = time?.getAttribute("datetime") ?? time?.getAttribute("dateTime");
    const publishedDate =
      normalizePublishedDate(datetime) ??
      normalizePublishedDate(normalizeText(time?.textContent).replace(BYLINE_TIME_TEXT_PREFIX, ""));

    if (author || publishedDate) return { author, publishedDate };
  }

  return { author: "", publishedDate: null };
}

const NAME_PATTERN = /^[A-ZÀ-ÖØ-Þ][\w'.&À-ÖØ-Þ-]*(?:\s+[A-ZÀ-ÖØ-Þ][\w'.&À-ÖØ-Þ-]*){1,2}$/u;
const NAME_WORD_PATTERN = /^[A-ZÀ-ÖØ-Þ][\w'.&À-ÖØ-Þ-]*$/u;

export function bylineAuthor(document: Document): string {
  const candidates = [...document.querySelectorAll(BYLINE_SELECTOR)];

  for (const candidate of candidates) {
    const anchored = [...candidate.querySelectorAll("a")]
      .map((anchor) => normalizeText(anchor.textContent))
      .filter(Boolean);
    const text = normalizeText(candidate.textContent);
    if (!text) continue;
    const author = bylineAuthorText(text, anchored);
    if (author) return author;
  }

  return "";
}

function bylineAuthorText(text: string, anchors: string[]): string {
  const anchoredName = anchors.find((value) => NAME_PATTERN.test(value));
  if (anchoredName) return anchoredName;

  const prefixed = text.match(BYLINE_PREFIXES);
  if (!prefixed) return "";

  const rest = text.slice(prefixed[0].length).trim();
  const head = rest.split(/[,·|—–/]/u)[0].trim();
  const nameWords: string[] = [];
  for (const word of head.split(/\s+/)) {
    if (!NAME_WORD_PATTERN.test(word) || nameWords.length === 3) break;
    nameWords.push(word);
  }
  const name = nameWords.join(" ");
  return NAME_PATTERN.test(name) ? name : "";
}
