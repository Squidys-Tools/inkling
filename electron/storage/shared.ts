import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";
import { Effect, Predicate } from "effect";
import { invalidInput } from "./errors.ts";

export type Metadata = Record<string, unknown>;

export function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function nonEmpty(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export const normalizeHttpUrl = Effect.fnUntraced(function* (value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value ?? "").trim());
  } catch {
    return yield* invalidInput("sourceUrl must be a valid HTTP or HTTPS URL");
  }
  if (!(url.protocol === "http:" || url.protocol === "https:") || !url.hostname) {
    return yield* invalidInput("sourceUrl must use HTTP or HTTPS and include a host");
  }
  url.hash = "";
  return url.toString();
});

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>|<hr\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+\.\s+)/gm, " ")
    .replace(/[*_~]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replace(/ \./g, ".")
    .replace(/ ,/g, ",")
    .replace(/ ;/g, ";")
    .replace(/ :/g, ":")
    .replace(/ !/g, "!")
    .replace(/ \?/g, "?");
}

export const isSafeItemId = (id: string) => /^[a-zA-Z0-9_-]{1,128}$/.test(id);

export function clampLimit(limit: number, fallback: number, maximum: number) {
  return Number.isFinite(limit) ? Math.min(maximum, Math.max(1, Math.trunc(limit))) : fallback;
}

export function isInside(candidate: string, root: string) {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot))
  );
}

export async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export const isMissing = (error: unknown) =>
  Predicate.hasProperty(error, "code") && error.code === "ENOENT";

// A statement run with `.raw` reports how many rows it touched.
export const changes = (result: unknown) => (result as { changes: number }).changes;
