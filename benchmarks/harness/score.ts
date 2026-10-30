import { readFileSync } from "node:fs";
import type { ExtractionOutcome } from "./extract";
import { corpusPath, type ExpectedSearch, type ManifestItem } from "./manifest";

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeForMatch(value).split(" ").filter(Boolean);
}

interface TermMatch {
  term: string;
  found: boolean;
}

function termMatches(text: string, terms: string[]): TermMatch[] {
  const haystack = normalizeForMatch(text);
  return terms.map((term) => ({ term, found: haystack.includes(normalizeForMatch(term)) }));
}

function bannedTermHits(text: string, terms: string[]): string[] {
  const haystack = normalizeForMatch(text);
  return terms.filter((term) => haystack.includes(normalizeForMatch(term)));
}

interface TokenStats {
  recall: number;
  precision: number;
  expectedCount: number;
  actualCount: number;
}

/**
 * Token-level recall/precision between an expected text and an extracted text.
 * Multiplicity-aware (bag of tokens): a repeated word that is missing or
 * duplicated counts each time, so engines are compared against the documented
 * word-accuracy metric rather than distinct tokens.
 */
function tokenStats(expected: string, actual: string): TokenStats {
  const expectedTokens = tokenize(expected);
  const actualTokens = tokenize(actual);
  if (expectedTokens.length === 0) {
    return {
      recall: 1,
      precision: actualTokens.length === 0 ? 1 : 0,
      expectedCount: 0,
      actualCount: actualTokens.length,
    };
  }

  const expectedCounts = new Map<string, number>();
  for (const token of expectedTokens) {
    expectedCounts.set(token, (expectedCounts.get(token) ?? 0) + 1);
  }
  const actualCounts = new Map<string, number>();
  for (const token of actualTokens) {
    actualCounts.set(token, (actualCounts.get(token) ?? 0) + 1);
  }

  let correct = 0;
  for (const [token, count] of expectedCounts) {
    correct += Math.min(count, actualCounts.get(token) ?? 0);
  }

  return {
    recall: correct / expectedTokens.length,
    precision: actualTokens.length === 0 ? 0 : correct / actualTokens.length,
    expectedCount: expectedTokens.length,
    actualCount: actualTokens.length,
  };
}

/** Simple string-similarity for title/author matching: 1 exact, 0.75 contained, 0 otherwise. */
function stringScore(expected: string, actual: string): number {
  const want = normalizeForMatch(expected);
  const got = normalizeForMatch(actual);
  if (want === got) return 1;
  if (want.length > 0 && (got.includes(want) || want.includes(got))) return 0.75;
  return 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 1;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type Status = "pass" | "partial" | "fail" | "skip";

export interface ItemResult {
  id: string;
  type: string;
  engine: string;
  status: Status;
  score: number;
  metrics: Record<string, unknown>;
  messages: string[];
}

function statusFor(score: number): Status {
  if (score === 1) return "pass";
  if (score >= 0.6) return "partial";
  return "fail";
}

export function skipResult(item: ManifestItem, reason: string): ItemResult {
  return {
    id: item.id,
    type: item.type,
    engine: "none",
    status: "skip",
    score: 0,
    metrics: { reason },
    messages: [reason],
  };
}

function scoreTerms(text: string, exp: ExpectedSearch) {
  const parts: number[] = [];
  const messages: string[] = [];
  if (exp.search_terms?.length) {
    const matches = termMatches(text, exp.search_terms);
    parts.push(matches.filter((m) => m.found).length / matches.length);
    for (const m of matches.filter((m) => !m.found))
      messages.push(`search term not found: "${m.term}"`);
  }
  const banned = bannedTermHits(text, exp.must_not_match ?? []);
  for (const term of banned) messages.push(`banned term found: "${term}"`);
  if (banned.length) parts.push(0);
  return { parts, messages };
}

export function scoreExtraction(item: ManifestItem, outcome: ExtractionOutcome): ItemResult {
  const exp = item.expected ?? {};
  const messages: string[] = [];

  if (!outcome.ok) {
    return {
      id: item.id,
      type: item.type,
      engine: outcome.engine,
      status: "fail",
      score: 0,
      metrics: { errorCode: outcome.errorCode, errorDetail: outcome.errorDetail },
      messages: [`ingestion failed (${outcome.errorCode}): ${outcome.errorDetail}`],
    };
  }

  const parts: number[] = [];
  const searchable = `${outcome.title ?? ""} ${outcome.description ?? ""} ${outcome.text ?? ""}`;
  if (exp.title) {
    const value = stringScore(exp.title, outcome.title ?? "");
    parts.push(value);
    if (value < 1) messages.push(`title mismatch: expected "${exp.title}", got "${outcome.title}"`);
  }
  if (exp.author) {
    const value = stringScore(exp.author, outcome.author ?? "");
    parts.push(value);
    if (value < 1)
      messages.push(`author mismatch: expected "${exp.author}", got "${outcome.author}"`);
  }
  const terms = scoreTerms(searchable, exp);
  parts.push(...terms.parts);
  messages.push(...terms.messages);

  if (exp.image_urls_min != null) {
    const value = Math.min(1, outcome.imageUrls.length / exp.image_urls_min);
    parts.push(value);
    if (value < 1)
      messages.push(`expected >= ${exp.image_urls_min} images, got ${outcome.imageUrls.length}`);
  }
  if (exp.safe_embeds?.length) {
    for (const req of exp.safe_embeds) {
      const count = outcome.safeEmbeds.filter((e) => e.provider === req.provider).length;
      const min = req.min ?? 1;
      const value = Math.min(1, count / min);
      parts.push(value);
      if (value < 1) messages.push(`expected >= ${min} "${req.provider}" embed(s), got ${count}`);
    }
  }
  if (exp.safe_embeds_max != null && outcome.safeEmbeds.length > exp.safe_embeds_max) {
    parts.push(0);
    messages.push(
      `expected <= ${exp.safe_embeds_max} embed(s), got ${outcome.safeEmbeds.length} (${outcome.safeEmbeds.map((e) => e.provider).join(", ")})`,
    );
  }

  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine: outcome.engine,
    status: statusFor(score),
    score,
    metrics: {
      title: outcome.title,
      author: outcome.author,
      imageUrls: outcome.imageUrls.length,
      safeEmbeds: outcome.safeEmbeds.length,
      textLength: (outcome.text ?? "").length,
      extractor: outcome.extractor,
    },
    messages,
  };
}

export function scorePlainText(item: ManifestItem, text: string, engine: string): ItemResult {
  const { parts, messages } = scoreTerms(text, item.expected ?? {});
  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine,
    status: statusFor(score),
    score,
    metrics: { textLength: text.length },
    messages,
  };
}

export function scorePdf(
  item: ManifestItem,
  extraction: { pages: string[]; text: string; engine: string; ocrPages: number },
  embeddedImages: number,
  pdfLatencyMs: number,
  ocrLatencyMs: number,
): ItemResult {
  const exp = item.expected ?? {};
  const text = extraction.text;
  const { parts, messages } = scoreTerms(text, exp);

  if (exp.ocr_text_file) {
    const expectedText = readFileSync(corpusPath(exp.ocr_text_file), "utf8");
    const stats = tokenStats(expectedText, text);
    parts.push((stats.recall + stats.precision) / 2);
    if (stats.recall < 1) messages.push(`OCR recall ${stats.recall.toFixed(2)}`);
    if (stats.precision < 1) messages.push(`OCR precision ${stats.precision.toFixed(2)}`);
  }

  if (exp.embedded_images_min != null) {
    const value = Math.min(1, embeddedImages / exp.embedded_images_min);
    parts.push(value);
    if (value < 1)
      messages.push(
        `expected >= ${exp.embedded_images_min} embedded image(s), got ${embeddedImages}`,
      );
  }

  const score = average(parts);
  return {
    id: item.id,
    type: item.type,
    engine: extraction.engine,
    status: statusFor(score),
    score,
    metrics: {
      pageCount: extraction.pages.length,
      textLength: text.length,
      ocrPages: extraction.ocrPages,
      embeddedImages,
      pdfLatencyMs,
      ocrLatencyMs,
    },
    messages,
  };
}

export function scoreOcr(
  item: ManifestItem,
  expectedText: string,
  actualText: string,
  engine: string,
  elapsedMs: number,
): ItemResult {
  const stats = tokenStats(expectedText, actualText);
  const score = (stats.recall + stats.precision) / 2;
  const messages: string[] = [];
  if (stats.recall < 1) {
    const actual = new Set(tokenize(actualText));
    const missing = [...new Set(tokenize(expectedText))].filter((t) => !actual.has(t));
    messages.push(`OCR recall ${stats.recall.toFixed(2)} (${stats.expectedCount} expected tokens)`);
    messages.push(`missing tokens (sample): ${missing.slice(0, 8).join(", ")}`);
  }
  if (stats.precision < 1) messages.push(`OCR precision ${stats.precision.toFixed(2)}`);
  return {
    id: item.id,
    type: item.type,
    engine,
    status: statusFor(score),
    score,
    metrics: { ...stats, elapsedMs },
    messages,
  };
}
