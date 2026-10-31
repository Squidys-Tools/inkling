import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW = 60_000;

export function originAllowed(origin: string | undefined) {
  const trimmed = origin?.trim();
  if (!trimmed || trimmed === "null") return true;
  if (trimmed === "app://local" || trimmed.startsWith("inkling://")) {
    return true;
  }
  for (const scheme of ["chrome-extension", "moz-extension", "safari-web-extension"]) {
    const prefix = `${scheme}://`;
    if (!trimmed.startsWith(prefix)) continue;
    const host = trimmed.slice(prefix.length);
    if (host && /^[a-z\d._-]+$/iu.test(host)) return true;
  }
  return false;
}

export function bearerToken(headers: IncomingHttpHeaders) {
  const value = headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") && value.length > 7
    ? value.slice(7)
    : null;
}

export function tokensEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createRateLimiter(now = Date.now) {
  const requestTimes: number[] = [];
  return () => {
    const current = now();
    while (requestTimes.length && current - requestTimes[0] >= RATE_LIMIT_WINDOW) {
      requestTimes.shift();
    }
    if (requestTimes.length >= RATE_LIMIT_MAX) return false;
    requestTimes.push(current);
    return true;
  };
}

export function corsHeaders(origin: string | undefined) {
  const trimmed = origin?.trim();
  const headers: Record<string, string> = { Vary: "Origin" };
  if (trimmed && trimmed !== "null" && originAllowed(trimmed)) {
    headers["Access-Control-Allow-Origin"] = trimmed;
  }
  return headers;
}
