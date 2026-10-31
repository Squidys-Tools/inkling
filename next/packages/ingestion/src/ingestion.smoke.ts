import { parseHTML } from "linkedom";
import { extractWithDefuddle } from "./defuddle-adapter.ts";
import { extractFallback } from "./fallback.ts";
import { ingestUrl } from "./url-ingestion.ts";
import { isUrlIngestionError } from "./errors.ts";
import { xPostOEmbedUrl } from "./x-post.ts";

// The pipeline only calls fetch; Bun types extra members onto it that a stub has no use for.
const stubFetch = (
  handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>,
) => handler as typeof fetch;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

const pageUrl = "https://example.com/articles/first";
const html = `
  <html><head>
    <title>Fallback title</title>
    <meta name="description" content="A useful description">
    <meta property="og:image" content="/images/cover.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <link rel="canonical" href="/articles/canonical">
  </head><body>
    <article>
      <h1>Fallback title</h1>
      <p>This article has enough meaningful text to exercise both the normal Defuddle path and the fallback path.</p>
      <img src="photos/inline.jpg" width="800" height="600">
      <iframe src="https://www.youtube.com/watch?v=abc12345678" title="Video"></iframe>
      <iframe src="https://www.youtube.com/not-a-video"></iframe>
      <video src="https://www.youtube.com/watch?v=abc12345678"></video>
      <video src="/media/clip.mp4"></video>
    </article>
  </body></html>`;

const { document } = parseHTML(html);
const defuddle = extractWithDefuddle(document, pageUrl);
assert(defuddle.contentHtml?.includes("meaningful text"), "Defuddle extracts article content");
assert(
  defuddle.canonicalUrl === "https://example.com/articles/canonical",
  "Defuddle normalizes canonical URL",
);

for (const [url, html, expectedAuthor] of [
  [
    "https://example.com/short",
    `<html><head><meta name="author" content="Mira Alderton"></head><body><article><h1>Short article</h1><p class="byline">By <span class="author">Mira Alderton</span> · <time datetime="2026-07-14">July 14, 2026</time></p><p>Enough meaningful article text for the normal extraction path to retain this page as readable content.</p></article></body></html>`,
    "Mira Alderton",
  ],
  [
    "https://example.com/news",
    `<html><body><article><h1>News article</h1><p class="byline">By Sam Okonkwo, City Desk · Updated 6:42 PM, August 3, 2026</p><p>Enough meaningful article text for the normal extraction path to retain this page as readable content.</p></article></body></html>`,
    "Sam Okonkwo",
  ],
  [
    "https://example.com/recipe",
    `<html><body><article><h1>Recipe article</h1><p class="byline">Recipe by June Park · Serves 2 · 25 minutes</p><p>Enough meaningful article text for the normal extraction path to retain this page as readable content.</p></article></body></html>`,
    "June Park",
  ],
] as const) {
  const article = await ingestUrl(url, {
    fetch: stubFetch(async () => new Response(html, { headers: { "content-type": "text/html" } })),
  });
  assert(article.author === expectedAuthor, `ingestUrl extracts author-only metadata for ${url}`);
}

const fallback = extractFallback(document, pageUrl);
assert(
  fallback.canonicalUrl === "https://example.com/articles/canonical",
  "fallback normalizes canonical URL",
);
assert(
  fallback.imageDimensions?.some(
    (image) =>
      image.url === "https://example.com/articles/photos/inline.jpg" &&
      image.width === 800 &&
      image.height === 600,
  ),
  "fallback keeps declared image dimensions",
);
assert(
  fallback.imageDimensions?.some(
    (image) =>
      image.url === "https://example.com/images/cover.jpg" &&
      image.width === 1200 &&
      image.height === 630,
  ),
  "fallback keeps Open Graph image dimensions",
);

const fetched = await ingestUrl(pageUrl, {
  fetch: stubFetch(
    async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
  ),
});
assert(fetched.extractor === "defuddle", "ingestUrl reports Defuddle extraction");
assert(
  fetched.imageUrls.includes("https://example.com/images/cover.jpg"),
  "ingestion keeps relative Open Graph image",
);
assert(
  fetched.imageUrls.includes("https://example.com/articles/photos/inline.jpg"),
  "ingestion keeps relative inline image",
);
assert(
  fetched.imageDimensions.some(
    (image) =>
      image.url === "https://example.com/images/cover.jpg" &&
      image.width === 1200 &&
      image.height === 630,
  ),
  "ingestion persists Open Graph image dimensions",
);

const fallbackFetched = await ingestUrl(pageUrl, {
  fetch: stubFetch(async () => new Response(html, { headers: { "content-type": "text/html" } })),
  extractArticle: () => {
    throw new Error("expected test failure");
  },
});
assert(fallbackFetched.extractor === "fallback", "ingestion falls back when Defuddle fails");

const roundupHtml = `
  <html><head><title>Roundup</title>
    <meta name="description" content="A subtitle line worth keeping">
    <script type="application/ld+json">{"@type":"Article","headline":"Roundup","author":{"@type":"Person","name":"Original Writer"},"datePublished":"2026-03-19T12:21:47-07:00"}</script>
  </head><body>
    <article>
      <header><h1>Roundup</h1></header>
      <aside aria-label="At a glance">
        <h3>At a Glance</h3>
        <ul><li>Coming September 2026.</li></ul>
      </aside>
      <h2>A subtitle line worth keeping</h2>
      <div class="textRow__minor">By <a href="/author/staff/">MacRumors Staff</a> <time itemprop="dateModified" dateTime="2026-08-18T16:31:35-07:00">on August 18, 2026</time></div>
      <p>Enough meaningful body text for the extractor to accept this page as readable article content.</p>
    </article>
  </body></html>`;

const roundup = await ingestUrl("https://example.com/roundup/thing/", {
  fetch: stubFetch(
    async () =>
      new Response(roundupHtml, { headers: { "content-type": "text/html; charset=utf-8" } }),
  ),
});
assert(roundup.author === "MacRumors Staff", "visible byline beats structured author metadata");
assert(
  roundup.publishedDate === "2026-08-18T23:31:35.000Z",
  "visible byline date beats structured publish date",
);
assert(roundup.html.includes("At a Glance"), "summary aside is promoted into article content");
assert(
  !/>roundup<\/h[12]>/iu.test(roundup.html),
  "heading duplicating the article title is removed",
);
assert(
  roundup.html.includes('class="article-lede"'),
  "heading duplicating the description becomes a lede paragraph",
);
const xPostUrl = "https://x.com/jack/status/20";
const xOEmbedHtml = `<blockquote class="twitter-tweet" data-dnt="true"><p lang="en">just setting up my twttr</p>&mdash; jack (@jack) <a href="${xPostUrl}">March 21, 2006</a></blockquote>`;
const ingestedXPost = await ingestUrl(xPostUrl, {
  fetch: stubFetch(async (url) => {
    assert(
      String(url) === xPostOEmbedUrl(xPostUrl),
      "X ingestion requests the official oEmbed endpoint",
    );
    return new Response(
      JSON.stringify({
        html: xOEmbedHtml,
        author_name: "jack",
        author_url: "https://x.com/jack",
        width: 550,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }),
});
assert(ingestedXPost.social?.provider === "x", "X URLs ingest as social posts");
assert(ingestedXPost.title === "jack's post", "X ingestion preserves the author in the title");

const redirectRequests: string[] = [];
const redirected = await ingestUrl(pageUrl, {
  fetch: stubFetch(async (url, init) => {
    assert(init?.redirect === "manual", "ingestion inspects redirects before following them");
    redirectRequests.push(String(url));
    if (redirectRequests.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/articles/redirected" },
      });
    }
    return new Response(html, { headers: { "content-type": "text/html" } });
  }),
});
assert(
  redirected.fetchedUrl === "https://example.com/articles/redirected",
  "safe redirects remain supported",
);
assert(redirectRequests.length === 2, "safe redirects are followed after validation");

let privateNetworkRejected = false;
try {
  await ingestUrl("http://127.0.0.1:1420/");
} catch (error) {
  privateNetworkRejected = isUrlIngestionError(error) && error.code === "invalid-url";
}
assert(privateNetworkRejected, "private-network URLs are rejected before fetch");

let ipv6PrivateNetworkRejected = false;
try {
  await ingestUrl("http://[::1]:1420/");
} catch (error) {
  ipv6PrivateNetworkRejected = isUrlIngestionError(error) && error.code === "invalid-url";
}
assert(ipv6PrivateNetworkRejected, "IPv6 loopback URLs are rejected before fetch");

let privateRedirectRejected = false;
try {
  await ingestUrl(pageUrl, {
    fetch: stubFetch(
      async () =>
        new Response(null, { status: 302, headers: { location: "http://127.0.0.1:1420/" } }),
    ),
  });
} catch (error) {
  privateRedirectRejected = isUrlIngestionError(error) && error.code === "invalid-url";
}
assert(
  privateRedirectRejected,
  "redirects to private-network URLs are rejected before the next fetch",
);

const youTubePoster = "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg";
const indexedYouTubeLink = await ingestUrl("https://www.youtube.com/watch?v=abc12345678", {
  fetch: stubFetch(async (url) => {
    assert(
      String(url).startsWith("https://www.youtube.com/oembed.json?url="),
      "video indexing uses the provider oEmbed endpoint",
    );
    return new Response(
      JSON.stringify({
        title: "Indexed video title",
        author_name: "Theo",
        thumbnail_url: youTubePoster,
      }),
      { headers: { "content-type": "application/json" } },
    );
  }),
});
assert(
  indexedYouTubeLink.title === "Indexed video title",
  "video indexing preserves oEmbed titles",
);
assert(
  indexedYouTubeLink.safeEmbeds[0]?.embedUrl ===
    "https://www.youtube-nocookie.com/embed/abc12345678",
  "video indexing stores the safe embed URL",
);
assert(
  indexedYouTubeLink.imageUrls.includes(youTubePoster),
  "video indexing stores the poster image",
);
console.log("Ingestion smoke checks passed.");
