import { Duration, Effect, Schedule, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http";
import { UrlIngestionError } from "./errors.ts";
import { assertPublicHost, type LookupHost } from "./public-host.ts";
import { normalizeHttpUrl, parseHttpUrl } from "./url.ts";

const MAX_REDIRECTS = 5;
const MAX_JSON_BYTES = 512 * 1024;
const USER_AGENT = "inkling/0.1 (+local article capture)";

export type RequestLimits = {
  timeoutMs: number;
  maxBytes: number;
  // Tests answer with fixed addresses; otherwise each host resolves through DNS.
  lookupHost?: LookupHost;
};

type PageRequest = RequestLimits & { allowPrivateNetwork?: boolean };

// Rate limits, gateway errors, and dropped connections get two more tries inside
// the caller's time budget. A Retry-After header sets the shortest wait before the next.
const withRetries = (client: HttpClient.HttpClient) =>
  client.pipe(
    HttpClient.retryTransient({ times: 2, schedule: Schedule.exponential("250 millis") }),
  );

const fail = (...args: ConstructorParameters<typeof UrlIngestionError>) =>
  Effect.fail(new UrlIngestionError(...args));

const tooLarge = (url: string) =>
  new UrlIngestionError(
    "content-too-large",
    "The downloaded page is larger than the ingestion limit.",
    { url },
  );

const withinBudget =
  (timeoutMs: number, url: string) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () =>
          Effect.fail(
            new UrlIngestionError("timeout", "The page took too long to download.", { url }),
          ),
      }),
    );

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

// Stops reading, and cancels the body, as soon as it passes the limit.
const readText = (response: HttpClientResponse.HttpClientResponse, maxBytes: number, url: string) =>
  response.stream.pipe(
    Stream.runFoldEffect(
      () => ({ total: 0, chunks: [] as Uint8Array[] }),
      (body, chunk) => {
        body.total += chunk.byteLength;
        if (body.total > maxBytes) return Effect.fail(tooLarge(url));
        body.chunks.push(chunk);
        return Effect.succeed(body);
      },
    ),
    Effect.map(({ total, chunks }) => {
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return new TextDecoder().decode(bytes);
    }),
  );

const parseUrl = (url: string, allowPrivateNetwork?: boolean) =>
  Effect.try({
    try: () => parseHttpUrl(url, { allowPrivateNetwork }).toString(),
    catch: (error) => error as UrlIngestionError,
  });

const checkHost = (url: string, request: PageRequest) =>
  request.allowPrivateNetwork
    ? Effect.void
    : Effect.tryPromise({
        try: () => assertPublicHost(url, request.lookupHost),
        catch: (error) =>
          error instanceof UrlIngestionError
            ? error
            : new UrlIngestionError("network-error", "The address could not be checked.", {
                cause: error,
                url,
              }),
      });

// Each hop is checked, by name and by resolved address, before it is requested,
// so fetch must not follow redirects on its own. Closing each hop's scope aborts
// the request, which cancels a body `read` left unread.
const requestFollowingRedirects = <A, E>(
  sourceUrl: string,
  request: PageRequest,
  accept: string,
  read: (response: HttpClientResponse.HttpClientResponse, url: string) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const client = HttpClient.withScope(withRetries(yield* HttpClient.HttpClient));
    let url = sourceUrl;
    for (let redirectCount = 0; ; redirectCount++) {
      yield* checkHost(url, request);
      const hop = yield* Effect.scoped(
        Effect.gen(function* () {
          // codeql[js/request-forgery,javascript/ssrf]: This local-first desktop pipeline intentionally fetches user-selected public URLs. parseHttpUrl rejects non-HTTP(S), credentialed, and private-network destinations and checkHost refuses hosts that resolve to private addresses before this boundary, for every redirect hop.
          const response = yield* client
            .execute(
              HttpClientRequest.get(url, { headers: { Accept: accept, "User-Agent": USER_AGENT } }),
            )
            .pipe(
              Effect.mapError(
                (cause) =>
                  new UrlIngestionError("network-error", "The page could not be downloaded.", {
                    cause,
                    url: sourceUrl,
                  }),
              ),
            );
          if (!isRedirectStatus(response.status))
            return { done: true as const, value: yield* read(response, url) };
          const location = response.headers.location;
          return { done: false as const, next: location ? normalizeHttpUrl(location, url) : null };
        }),
      );
      if (hop.done) return hop.value;
      if (redirectCount >= MAX_REDIRECTS) {
        return yield* fail("redirect-error", "The page redirected too many times.", { url });
      }
      if (!hop.next) {
        return yield* fail("redirect-error", "The page returned an invalid redirect destination.", {
          url,
        });
      }
      url = yield* parseUrl(hop.next, request.allowPrivateNetwork);
    }
  }).pipe(
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
    withinBudget(request.timeoutMs, sourceUrl),
  );

const isPageType = (contentType: string) =>
  !contentType ||
  contentType.includes("text/html") ||
  contentType.includes("application/xhtml+xml") ||
  contentType.startsWith("text/plain");

/** The page's HTML, or `html: null` when the URL answers with a file such as an image or PDF. */
export const downloadPage = (sourceUrl: string, request: PageRequest) =>
  requestFollowingRedirects(
    sourceUrl,
    request,
    "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.5",
    (response, fetchedUrl) =>
      Effect.gen(function* () {
        if (response.status < 200 || response.status >= 300) {
          return yield* fail("http-error", `The page returned HTTP ${response.status}.`, {
            status: response.status,
            url: sourceUrl,
          });
        }
        const contentType = response.headers["content-type"]?.toLowerCase() ?? "";
        if (!isPageType(contentType)) return { fetchedUrl, contentType, html: null };
        const html = yield* readText(response, request.maxBytes, fetchedUrl).pipe(
          Effect.mapError((error) =>
            error instanceof UrlIngestionError
              ? error
              : new UrlIngestionError("network-error", "The page could not be read.", {
                  cause: error,
                  url: fetchedUrl,
                }),
          ),
        );
        return { fetchedUrl, contentType, html };
      }),
  );

// Provider metadata is enrichment only: any failure, including a slow or
// rate-limited provider, yields null and the capture carries on without it.
export const fetchJson = (url: string, request: RequestLimits) =>
  requestFollowingRedirects(url, request, "application/json", (response, fetchedUrl) =>
    Effect.gen(function* () {
      if (response.status < 200 || response.status >= 300) return null;
      const body = yield* readText(
        response,
        Math.min(request.maxBytes, MAX_JSON_BYTES),
        fetchedUrl,
      );
      return yield* Effect.try(() => JSON.parse(body) as unknown);
    }),
  ).pipe(Effect.catch(() => Effect.succeed(null)));

export function runHttp<A>(
  effect: Effect.Effect<A, UrlIngestionError, HttpClient.HttpClient>,
  fetch: typeof globalThis.fetch | undefined,
) {
  const provided = effect.pipe(Effect.provide(FetchHttpClient.layer));
  return Effect.runPromise(
    fetch ? provided.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)) : provided,
  );
}
