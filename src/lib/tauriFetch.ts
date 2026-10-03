import { invoke } from "@tauri-apps/api/core";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_USER_AGENT = "inkling/0.1 (+local article capture)";
const MAX_REDIRECTS = 20;

interface FetchHttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function withAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

async function singleHop(
  url: string,
  headers: Headers,
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
  maxBytes: number,
): Promise<Response> {
  const result = await withAbort(
    invoke<FetchHttpResult>("fetch_http", {
      url,
      userAgent: headers.get("User-Agent") ?? DEFAULT_USER_AGENT,
      accept: headers.get("Accept") ?? "*/*",
      timeoutMs,
      maxBytes,
    }),
    signal,
  );

  // Spec: 204/205/304 must be constructed with a null body.
  const nullBody = result.status === 204 || result.status === 205 || result.status === 304;
  return new Response(nullBody ? null : result.body, {
    status: result.status,
    headers: result.headers,
  });
}

/**
 * Merge the way `fetch` does: a `Request` input contributes its own headers,
 * and `init.headers` overrides them rather than replacing the set.
 */
function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  return headers;
}

/**
 * Desktop `fetch` that routes through the Rust `fetch_http` command so
 * article capture is not blocked by webview CORS. Redirect policy matches
 * the RequestInit contract: manual returns the 3xx as-is, follow walks
 * locations (validated as relative to the current hop by URL), error throws.
 *
 * Only `Accept` and `User-Agent` reach the wire, because that is all the
 * `fetch_http` command takes. A method or body cannot be honoured, so this
 * rejects them instead of quietly performing a GET — see the guard below.
 */
export async function tauriFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    // `fetch_http` is a GET. Honouring the shape of `fetch` while sending
    // something else is the kind of bug that only shows up as missing data.
    throw new TypeError(`tauriFetch cannot send ${method}: fetch_http is a GET`);
  }
  const url = requestUrl(input);
  const headers = mergeHeaders(input, init);
  const signal = init?.signal ?? null;
  const redirect = init?.redirect ?? "follow";
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const maxBytes = DEFAULT_MAX_RESPONSE_BYTES;

  let current = url;
  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    const response = await singleHop(current, headers, signal, timeoutMs, maxBytes);
    if (!isRedirectStatus(response.status)) return response;
    if (redirect === "manual") return response;
    if (redirect === "error") {
      throw new TypeError("Failed to fetch: unexpected redirect");
    }
    const location = response.headers.get("location");
    if (!location) return response;
    try {
      current = new URL(location, current).toString();
    } catch {
      throw new TypeError("Failed to fetch: invalid redirect destination");
    }
  }
  throw new TypeError("Failed to fetch: too many redirects");
}
