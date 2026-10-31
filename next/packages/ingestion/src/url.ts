import ipaddr from "ipaddr.js";
import { UrlIngestionError } from "./errors.ts";

const MAX_URL_LENGTH = 8_192;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/u;
const BARE_HOST_RE =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}\.?(:\d+)?(?:\/[^\s]*)?$/u;

export interface HttpUrlOptions {
  allowPrivateNetwork?: boolean;
}

// ipaddr.js calls deprecated IPv4-compatible addresses (::127.0.0.1) unicast.
const IPV4_COMPATIBLE = ipaddr.IPv6.parseCIDR("::/96");

// Only unicast is public: private, loopback, link-local, CGNAT, multicast,
// documentation and other reserved ranges all have a range name of their own.
export function isPublicIpAddress(value: string) {
  if (!ipaddr.isValid(value)) return false;
  let address = ipaddr.parse(value);
  if (address instanceof ipaddr.IPv6) {
    if (address.isIPv4MappedAddress()) address = address.toIPv4Address();
    else if (address.match(IPV4_COMPATIBLE)) return false;
  }
  return address.range() === "unicast";
}

// Text alone cannot tell where a name resolves; a process that can resolve
// names checks the addresses too (public-host.ts). A single-label name such as
// `router` only resolves on the user's own network, so it is refused here.
function isPrivateNetworkHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "").replace(/\.$/u, "");
  if (ipaddr.isValid(value)) return !isPublicIpAddress(value);
  return (
    !value.includes(".") ||
    value.endsWith(".localhost") ||
    value.endsWith(".local") ||
    value.endsWith(".internal")
  );
}

// A bare host such as `example.com/path` is saved as https; anything with a
// scheme or without a dotted host is left for the URL parser to judge.
function withHttpsScheme(value: string) {
  const trimmed = value.trim();
  return SCHEME_RE.test(trimmed) || !BARE_HOST_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function parseHttpUrl(input: string, options: HttpUrlOptions = {}): URL {
  const value = withHttpsScheme(input);

  if (value.length === 0 || value.length > MAX_URL_LENGTH) {
    throw new UrlIngestionError("invalid-url", "The URL is empty or too long.", { url: input });
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new UrlIngestionError("invalid-url", "The URL could not be parsed.", {
      cause,
      url: input,
    });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlIngestionError("invalid-url", "Only HTTP and HTTPS URLs can be saved.", {
      url: input,
    });
  }

  if (parsed.username || parsed.password || !parsed.hostname) {
    throw new UrlIngestionError(
      "invalid-url",
      "The URL contains unsupported credentials or a missing host.",
      {
        url: input,
      },
    );
  }

  if (!options.allowPrivateNetwork && isPrivateNetworkHostname(parsed.hostname)) {
    throw new UrlIngestionError("invalid-url", "Private network URLs are not supported.", {
      url: input,
    });
  }

  return parsed;
}

export function tryParseHttpUrl(input: string, options?: HttpUrlOptions) {
  try {
    return parseHttpUrl(input, options);
  } catch {
    return null;
  }
}

export function safePublicImageUrl(value: unknown) {
  return typeof value === "string" ? tryParseHttpUrl(value)?.toString() : undefined;
}

export function normalizeHttpUrl(
  value: string | null | undefined,
  baseUrl?: string,
): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.startsWith("#")) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(candidate, baseUrl) : new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password || !parsed.hostname) {
    return null;
  }

  parsed.hash = "";
  return parsed.toString();
}

export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizePublishedDate(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) {
    return null;
  }

  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))];
}
