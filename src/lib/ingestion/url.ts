import { UrlIngestionError } from "./errors";

const MAX_URL_LENGTH = 8_192;

export interface HttpUrlOptions {
  allowPrivateNetwork?: boolean;
}

type Ipv4Address = readonly [number, number, number, number];

function parseIpv4(hostname: string): Ipv4Address | null {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/u.test(part))) return null;

  const octets = parts.map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255)
    ? [octets[0], octets[1], octets[2], octets[3]]
    : null;
}

function isPrivateIpv4(address: Ipv4Address): boolean {
  const [first, second] = address;
  return first === 0
    || first === 10
    || first === 100 && second >= 64 && second <= 127
    || first === 127
    || first === 169 && second === 254
    || first === 172 && second >= 16 && second <= 31
    || first === 192 && (second === 0 || second === 2 || second === 168)
    || first === 198 && (second === 18 || second === 19 || second === 51)
    || first === 203 && second === 0
    || first >= 224;
}

function parseIpv6Part(part: string): number[] | null {
  if (!part) return [];

  const pieces = part.split(":");
  const groups: number[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (piece.includes(".")) {
      if (index !== pieces.length - 1) return null;
      const ipv4 = parseIpv4(piece);
      if (!ipv4) return null;
      groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/u.test(piece)) return null;
    groups.push(parseInt(piece, 16));
  }
  return groups;
}

function parseIpv6(hostname: string): number[] | null {
  const value = hostname.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
  if (!value.includes(":")) return null;

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = parseIpv6Part(halves[0]);
  const right = halves.length === 2 ? parseIpv6Part(halves[1]) : [];
  if (!left || !right) return null;

  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  return missing > 0 ? [...left, ...Array.from({ length: missing }, () => 0), ...right] : null;
}

function isPrivateNetworkHostname(hostname: string): boolean {
  const value = hostname.toLowerCase().replace(/^\[/u, "").replace(/\]$/u, "").replace(/\.$/u, "");
  if (value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal")) {
    return true;
  }

  const ipv4 = parseIpv4(value);
  if (ipv4) return isPrivateIpv4(ipv4);

  const ipv6 = parseIpv6(value);
  if (!ipv6) return false;

  const allZero = ipv6.every((group) => group === 0);
  const loopback = ipv6.slice(0, 7).every((group) => group === 0) && ipv6[7] === 1;
  if (allZero || loopback || (ipv6[0] & 0xfe00) === 0xfc00 || (ipv6[0] & 0xffc0) === 0xfe80) {
    return true;
  }

  const mappedIpv4 = ipv6.slice(0, 5).every((group) => group === 0) && ipv6[5] === 0xffff;
  const compatibleIpv4 = ipv6.slice(0, 6).every((group) => group === 0);
  if (!mappedIpv4 && !compatibleIpv4) return false;

  const embedded: Ipv4Address = [
    ipv6[6] >> 8,
    ipv6[6] & 0xff,
    ipv6[7] >> 8,
    ipv6[7] & 0xff,
  ];
  return isPrivateIpv4(embedded);
}

export function parseHttpUrl(input: string, options: HttpUrlOptions = {}): URL {
  const value = input.trim();

  if (value.length === 0 || value.length > MAX_URL_LENGTH) {
    throw new UrlIngestionError("invalid-url", "The URL is empty or too long.", { url: input });
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (cause) {
    throw new UrlIngestionError("invalid-url", "The URL could not be parsed.", { cause, url: input });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlIngestionError("invalid-url", "Only HTTP and HTTPS URLs can be saved.", { url: input });
  }

  if (parsed.username || parsed.password || !parsed.hostname) {
    throw new UrlIngestionError("invalid-url", "The URL contains unsupported credentials or a missing host.", {
      url: input,
    });
  }

  if (!options.allowPrivateNetwork && isPrivateNetworkHostname(parsed.hostname)) {
    throw new UrlIngestionError("invalid-url", "Private network URLs are not supported.", { url: input });
  }

  return parsed;
}

export function normalizeHttpUrl(value: string | null | undefined, baseUrl?: string): string | null {
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
