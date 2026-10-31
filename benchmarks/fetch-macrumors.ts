#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseHTML } from "linkedom";
import { extractJsonLdMetadata } from "../packages/ingestion/src/json-ld.ts";
import { normalizeText } from "../packages/ingestion/src/url.ts";
import { startCorpusServer } from "./harness/server";
import { extractFixture } from "./harness/extract";
import { benchmarksRoot, loadManifest, type ManifestItem } from "./harness/manifest";

const corpusDir = join(benchmarksRoot, "corpus", "live", "macrumors");
const expectedDir = join(benchmarksRoot, "expected", "extraction");
const manifestPath = join(benchmarksRoot, "manifest.json");
const HOMEPAGE = "https://www.macrumors.com/";
const USER_AGENT = "inkling/0.1 (+local article capture)";
const COUNT = Number(process.argv[2] ?? 6);

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "along",
  "among",
  "another",
  "around",
  "been",
  "before",
  "between",
  "both",
  "could",
  "from",
  "have",
  "into",
  "more",
  "most",
  "much",
  "other",
  "over",
  "said",
  "says",
  "some",
  "such",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "three",
  "through",
  "time",
  "until",
  "using",
  "what",
  "when",
  "which",
  "while",
  "with",
  "would",
  "your",
  "will",
]);

interface ArticleLink {
  url: string;
  date: string;
  slug: string;
}

async function fetchText(url: string) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.text();
}

function latestArticleLinks(html: string) {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const links: ArticleLink[] = [];
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    const pathname = href.replace(/^https?:\/\/[^/]+/, "");
    const match = /^\/(\d{4}\/\d{2}\/\d{2})\/([a-z0-9-]+)\/?$/.exec(pathname);
    if (!match || seen.has(href)) continue;
    seen.add(href);
    links.push({
      url: `https://www.macrumors.com${pathname.replace(/\/$/, "")}/`,
      date: match[1],
      slug: match[2],
    });
  }
  links.sort((a, b) => `${b.date}/${b.slug}`.localeCompare(`${a.date}/${a.slug}`));
  return links;
}

/** Distinctive terms picked from the article body (validates body extraction). */
function pickSearchTerms(description: string, bodyText: string, limit = 4) {
  const counts = new Map<string, number>();
  const text = `${description} ${bodyText}`.toLowerCase();
  const words = text.replace(/[^a-z0-9\s-]/g, " ").split(/\s+/);
  for (const word of words) {
    const cleaned = word.trim();
    if (cleaned.length < 4 || STOPWORDS.has(cleaned)) continue;
    counts.set(cleaned, (counts.get(cleaned) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);
}

function bylineAuthor(document: Document) {
  for (const element of document.querySelectorAll(
    '[class*="byline"], [class*="author"], [rel="author"]',
  )) {
    const anchors = [...element.querySelectorAll("a")]
      .map((a) => normalizeText(a.textContent))
      .filter(Boolean);
    for (const anchor of anchors) {
      if (/^[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,2}$/.test(anchor)) return anchor;
    }
    const text = normalizeText(element.textContent);
    const match = /\bby\s+([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)?)\b/i.exec(text);
    if (match) return match[1];
  }
  return "";
}

const fixtureName = (article: ArticleLink) =>
  `${article.date.replaceAll("/", "-")}-${article.slug}.html`;

function buildExpected(html: string, url: string, article: ArticleLink) {
  const { document } = parseHTML(html);
  const structured = extractJsonLdMetadata(document, url);
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const ogDescription = document
    .querySelector('meta[property="og:description"]')
    ?.getAttribute("content");
  const bodyText = normalizeText(document.querySelector("article")?.textContent ?? "");
  const title = normalizeText(structured.title || ogTitle || "");
  const author = normalizeText(structured.author || bylineAuthor(document));
  const description = normalizeText(structured.description || ogDescription || "");
  return {
    title,
    author,
    description,
    publishedDate: structured.publishedDate ?? null,
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    id: `article-live-macrumors-${article.slug}`,
    file: `corpus/live/macrumors/${fixtureName(article)}`,
    searchTerms: pickSearchTerms(description, bodyText),
  };
}

async function main() {
  console.log(`Fetching MacRumors homepage...`);
  const homepage = await fetchText(HOMEPAGE);
  const candidates = latestArticleLinks(homepage);
  console.log(`Found ${candidates.length} article links on the homepage.`);

  const existing = new Set(
    loadManifest()
      .items.filter((item) => item.id.startsWith("article-live-macrumors-"))
      .map((item) => basename(item.path)),
  );
  const chosen = candidates
    .filter((candidate) => !existing.has(fixtureName(candidate)))
    .slice(0, COUNT);
  console.log(`Fetching ${chosen.length} latest article(s).`);

  mkdirSync(corpusDir, { recursive: true });
  mkdirSync(expectedDir, { recursive: true });

  const fetched: ReturnType<typeof buildExpected>[] = [];

  for (const article of chosen) {
    console.log(`  article-live-macrumors-${article.slug} <- ${article.url}`);
    const html = await fetchText(article.url);
    const expected = buildExpected(html, article.url, article);
    if (!expected.title || !expected.author) {
      console.warn(`    WARN: no title/author in JSON-LD for ${article.url}; skipping`);
      continue;
    }
    writeFileSync(join(corpusDir, fixtureName(article)), html);
    writeFileSync(
      join(expectedDir, `${expected.id}.json`),
      `${JSON.stringify(expected, null, 2)}\n`,
    );
    fetched.push(expected);
  }

  if (fetched.length === 0) {
    console.log("Nothing new to fetch.");
    return;
  }

  const newItems: ManifestItem[] = fetched.map((expected) => ({
    id: expected.id,
    path: expected.file,
    type: "article",
    language: "en",
    expected: {
      title: expected.title,
      author: expected.author,
      search_terms: expected.searchTerms,
    },
    notes: `Live MacRumors article (fetched ${expected.fetchedAt.slice(0, 10)}); ${expected.sourceUrl}`,
  }));
  const manifest = loadManifest();
  const kept = manifest.items;
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifest, items: [...kept, ...newItems] }, null, 2)}\n`,
  );
  console.log(`Manifest updated: ${kept.length} existing + ${newItems.length} macrumors item(s).`);

  const server = startCorpusServer(join(benchmarksRoot, "corpus"));
  console.log(`\nVerifying via production ingestion pipeline (${server.baseUrl}):`);
  const verified: { id: string; ok: boolean; score: number }[] = [];
  for (const exp of fetched) {
    const outcome = await extractFixture(server.baseUrl, exp.file);
    if (!outcome.ok) {
      console.log(`  ${exp.id}: INGEST FAILED (${outcome.errorCode})`);
      verified.push({ id: exp.id, ok: false, score: 0 });
      continue;
    }
    const titleOk = normalizeText(outcome.title ?? "") === normalizeText(exp.title);
    const authorOk = normalizeText(outcome.author ?? "") === normalizeText(exp.author);
    const searchable =
      `${outcome.title ?? ""} ${outcome.description ?? ""} ${outcome.text ?? ""}`.toLowerCase();
    const terms = exp.searchTerms.filter((term) => searchable.includes(term.toLowerCase()));
    const score = terms.length / exp.searchTerms.length;
    console.log(
      `  ${exp.id}: title=${titleOk ? "OK" : `MISS (${JSON.stringify(outcome.title)})`} author=${authorOk ? "OK" : `MISS (${JSON.stringify(outcome.author)})`} terms=${terms.length}/${exp.searchTerms.length} textLen=${(outcome.text ?? "").length} extractor=${outcome.extractor}`,
    );
    verified.push({ id: exp.id, ok: titleOk && authorOk && score === 1, score });
  }
  server.stop();

  const failed = verified.filter((v) => !v.ok);
  console.log(`\n${verified.length - failed.length}/${verified.length} fixtures verified.`);
  if (failed.length) process.exit(1);
}

await main();
