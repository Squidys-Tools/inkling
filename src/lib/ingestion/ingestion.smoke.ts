import { parseHTML } from "linkedom";
import { DefaultDefuddleAdapter } from "./defuddle-adapter";
import { extractFallback } from "./fallback";
import { collectSafeEmbeds, sanitizeHtml } from "./html-safety";
import { classifyFile } from "./file-classification";
import { assetRelativePath, sanitizeAssetSegment, thumbnailRelativePath } from "./asset-paths";
import { ingestUrl } from "./url-ingestion";
import { isUrlIngestionError } from "./errors";
import { normalizeHttpUrl } from "./url";
import { sanitizeEmbedUrl } from "./safe-embeds";
import { autoplayEmbedUrl, providerLabel, videoLinkFromSourceUrl } from "./video-links";
import { normalizeXPostOEmbed, parseXPostUrl, xPostOEmbedUrl } from "./x-post";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`);
}

const pageUrl = "https://example.com/articles/first";
const html = `
  <html><head>
    <title>Fallback title</title>
    <meta name="description" content="A useful description">
    <meta property="og:image" content="/images/cover.jpg">
    <link rel="canonical" href="/articles/canonical">
  </head><body>
    <article>
      <h1>Fallback title</h1>
      <p>This article has enough meaningful text to exercise both the normal Defuddle path and the fallback path.</p>
      <img src="photos/inline.jpg">
      <iframe src="https://www.youtube.com/watch?v=abc12345678" title="Video"></iframe>
      <iframe src="https://www.youtube.com/not-a-video"></iframe>
      <video src="https://www.youtube.com/watch?v=abc12345678"></video>
      <video src="/media/clip.mp4"></video>
    </article>
  </body></html>`;

const { document } = parseHTML(html);
const defuddle = new DefaultDefuddleAdapter().extract(document, pageUrl);
assert(defuddle.contentHtml?.includes("meaningful text"), "Defuddle extracts article content");
assert(defuddle.canonicalUrl === "https://example.com/articles/canonical", "Defuddle normalizes canonical URL");

const fallback = extractFallback(document, pageUrl);
assert(fallback.canonicalUrl === "https://example.com/articles/canonical", "fallback normalizes canonical URL");
assert(fallback.imageUrls?.includes("https://example.com/articles/photos/inline.jpg"), "fallback resolves relative image URL");

const safeEmbeds = collectSafeEmbeds(document, pageUrl);
assert(safeEmbeds.some((embed) => embed.provider === "youtube"), "valid YouTube iframe is allowlisted");
assert(!safeEmbeds.some((embed) => embed.sourceUrl.includes("not-a-video")), "malformed YouTube URL is rejected");
assert(!safeEmbeds.some((embed) => embed.kind === "video" && embed.sourceUrl.includes("youtube.com/watch")), "provider URL is not accepted as direct video media");

const sanitized = sanitizeHtml(`<iframe src="javascript:alert(1)"></iframe><video src="https://example.com/not-a-video"></video>`, pageUrl);
assert(!sanitized.includes("javascript:"), "unsafe iframe URL is removed");
assert(!sanitized.includes("not-a-video"), "unsupported direct video URL is removed");

const fetched = await ingestUrl(pageUrl, {
  fetch: async () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
});
assert(fetched.extractor === "defuddle", "ingestUrl reports Defuddle extraction");
assert(fetched.imageUrls.includes("https://example.com/images/cover.jpg"), "ingestion keeps relative Open Graph image");
assert(fetched.imageUrls.includes("https://example.com/articles/photos/inline.jpg"), "ingestion keeps relative inline image");

const fallbackFetched = await ingestUrl(pageUrl, {
  fetch: async () => new Response(html, { headers: { "content-type": "text/html" } }),
  defuddleAdapter: { name: "failing-test-adapter", extract: () => { throw new Error("expected test failure"); } },
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
  fetch: async () => new Response(roundupHtml, { headers: { "content-type": "text/html; charset=utf-8" } }),
});
assert(roundup.author === "MacRumors Staff", "visible byline beats structured author metadata");
assert(roundup.publishedDate === "2026-08-18T23:31:35.000Z", "visible byline date beats structured publish date");
assert(roundup.html.includes("At a Glance"), "summary aside is promoted into article content");
assert(!/>roundup<\/h[12]>/iu.test(roundup.html), "heading duplicating the article title is removed");
assert(roundup.html.includes('class="article-lede"'), "heading duplicating the description becomes a lede paragraph");
const xPostUrl = "https://x.com/jack/status/20";
assert(parseXPostUrl(`${xPostUrl}#reply`)?.postId === "20", "X post URLs are recognized");
assert(parseXPostUrl("https://x.com/jack") === null, "X profile URLs are not treated as posts");
const xOEmbedHtml = `<blockquote class="twitter-tweet" data-dnt="true"><p lang="en">just setting up my twttr</p>&mdash; jack (@jack) <a href="${xPostUrl}">March 21, 2006</a></blockquote>`;
const xOEmbed = normalizeXPostOEmbed(xPostUrl, {
  html: xOEmbedHtml,
  author_name: "jack",
  author_url: "https://x.com/jack",
  width: 550,
});
assert(xOEmbed?.provider === "x", "X oEmbed responses become social metadata");
assert(xOEmbed?.text === "just setting up my twttr", "X oEmbed text is extracted");
const ingestedXPost = await ingestUrl(xPostUrl, {
  fetch: async (url) => {
    assert(String(url) === xPostOEmbedUrl(xPostUrl), "X ingestion requests the official oEmbed endpoint");
    return new Response(JSON.stringify({
      html: xOEmbedHtml,
      author_name: "jack",
      author_url: "https://x.com/jack",
      width: 550,
    }), { headers: { "content-type": "application/json" } });
  },
});
assert(ingestedXPost.social?.provider === "x", "X URLs ingest as social posts");
assert(ingestedXPost.title === "jack's post", "X ingestion preserves the author in the title");

const redirectRequests: string[] = [];
const redirected = await ingestUrl(pageUrl, {
  fetch: async (url, init) => {
    assert(init?.redirect === "manual", "ingestion inspects redirects before following them");
    redirectRequests.push(String(url));
    if (redirectRequests.length === 1) {
      return new Response(null, { status: 302, headers: { location: "https://example.com/articles/redirected" } });
    }
    return new Response(html, { headers: { "content-type": "text/html" } });
  },
});
assert(redirected.fetchedUrl === "https://example.com/articles/redirected", "safe redirects remain supported");
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
    fetch: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:1420/" } }),
  });
} catch (error) {
  privateRedirectRejected = isUrlIngestionError(error) && error.code === "invalid-url";
}
assert(privateRedirectRejected, "redirects to private-network URLs are rejected before the next fetch");

assert(normalizeHttpUrl("../cover.jpg", pageUrl) === "https://example.com/cover.jpg", "relative URL normalization works");
assert(sanitizeEmbedUrl("https://youtu.be/abc12345678")?.provider === "youtube", "standalone YouTube policy allows valid URL");
assert(sanitizeEmbedUrl("https://videos.example/clip.mp4", { allowedDirectMediaOrigins: ["https://videos.example"] })?.type === "video", "standalone direct-media policy allows exact origin");
assert(sanitizeEmbedUrl("https://videos.example/clip.mp4", { allowedDirectMediaOrigins: ["https://other.example"] }) === null, "standalone direct-media policy rejects unknown origin");
assert(sanitizeEmbedUrl("javascript:alert(1)") === null, "standalone embed policy rejects javascript URL");

const youTubeLink = videoLinkFromSourceUrl("https://www.youtube.com/watch?v=abc12345678");
assert(youTubeLink?.provider === "youtube", "YouTube watch links become video link cards");
assert(youTubeLink?.embedUrl === "https://www.youtube-nocookie.com/embed/abc12345678", "video link embed URLs are canonicalized");
assert(youTubeLink?.posterUrl === "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg", "YouTube video links derive a poster image");
const vimeoLink = videoLinkFromSourceUrl("https://vimeo.com/12345678901");
assert(vimeoLink?.provider === "vimeo" && vimeoLink.posterUrl === undefined, "Vimeo links become video cards without a derived poster");
assert(videoLinkFromSourceUrl("https://example.com/articles/first") === null, "non-video article links stay articles");
assert(videoLinkFromSourceUrl("https://youtube.com/channel/xyz") === null, "YouTube pages without a video id stay articles");
assert(autoplayEmbedUrl("https://player.vimeo.com/video/123") === "https://player.vimeo.com/video/123?autoplay=1", "autoplay parameter appends cleanly");
assert(providerLabel("youtube") === "YouTube" && providerLabel("vimeo") === "Vimeo", "provider labels render properly");

assert(classifyFile({ name: "photo.pdf", type: "image/png" }) === "image", "recognized MIME type beats misleading extension");
assert(classifyFile({ name: "clip.bin", type: "video/mp4; codecs=h264" }) === "video", "video MIME type is recognized");
assert(classifyFile({ name: "document.PDF", type: "" }) === "pdf", "PDF extension fallback works");
assert(thumbnailRelativePath("item-1", "image") === "items/item-1/thumbnail.webp", "image thumbnail policy is stable");
assert(thumbnailRelativePath("item-1", "other") === null, "other files do not get thumbnails");
assert(assetRelativePath({ itemId: "../item", variant: "original", extension: ".jpg" }) === "items/-item/original.jpg", "asset paths remain relative");
assert(sanitizeAssetSegment("", "../unsafe fallback") === "-unsafe-fallback", "fallback asset segment is sanitized");

console.log("Ingestion smoke checks passed.");
