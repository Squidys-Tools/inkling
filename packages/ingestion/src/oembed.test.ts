import { expect, test } from "bun:test";
import { ingestVideoLink, ingestXPost } from "./oembed.ts";
import { videoLinkFromSourceUrl } from "./video-links.ts";

const lookupHost = async () => [{ address: "93.184.215.14" }];

// regression: both providers answered the old `/oembed.json` URLs with an HTML 404, so every
// video kept its placeholder title.
test.each([
  {
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    endpoint: "https://www.youtube.com/oembed?format=json&url=",
    title: "Never Gonna Give You Up",
    author: "Rick Astley",
  },
  {
    sourceUrl: "https://vimeo.com/76979871",
    endpoint: "https://vimeo.com/api/oembed.json?url=",
    title: "The New Vimeo Player",
    author: "Vimeo",
  },
])("$sourceUrl is titled from the provider's real oEmbed endpoint", async (video) => {
  const requested: string[] = [];
  const fetch = (async (url: string | URL | Request) => {
    requested.push(String(url));
    return String(url).startsWith(video.endpoint)
      ? Response.json({ title: video.title, author_name: video.author })
      : new Response("<html>404 Not Found</html>", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
  }) as typeof globalThis.fetch;
  const videoLink = videoLinkFromSourceUrl(video.sourceUrl);
  if (!videoLink) throw new Error("expected a video link");

  const result = await ingestVideoLink(video.sourceUrl, videoLink, fetch, {
    timeoutMs: 4_000,
    maxBytes: 1_000_000,
    lookupHost,
  });

  expect(requested).toEqual([video.endpoint + encodeURIComponent(video.sourceUrl)]);
  expect(result.title).toBe(video.title);
  expect(result.author).toBe(video.author);
});

// Invented account; the page carries its payload as JSON inside a script string.
const xPostUrl = "https://x.com/mara_okafor/status/301";
const xPage = `<script>self.__a = ${JSON.stringify(
  JSON.stringify({
    __typename: "Tweet",
    rest_id: "301",
    details: {
      full_text: "Tide tables, annotated",
      display_text_range: [0, 22],
      created_at_ms: Date.UTC(2026, 9, 3, 14, 5),
    },
    core: {
      user_results: {
        result: {
          core: { name: "Mara Okafor", screen_name: "mara_okafor" },
          avatar: { image_url: "https://pbs.twimg.com/profile_images/1/m_normal.jpg" },
        },
      },
    },
    media_entities2: [
      {
        type: "photo",
        media_url_https: "https://pbs.twimg.com/media/Tide.jpg",
        original_info: { width: 1200, height: 800 },
        ext_alt_text: "A hand-marked tide chart",
      },
    ],
  }),
)};</script>`;
const xOEmbed = {
  html: `<blockquote class="twitter-tweet"><p lang="en">Tide tables, annotated</p>&mdash; Mara Okafor (@mara_okafor) <a href="${xPostUrl}">October 3, 2026</a></blockquote>`,
  author_name: "Mara Okafor",
  author_url: "https://x.com/mara_okafor",
  width: 550,
};

function xFetch(answers: { oEmbed: boolean; page: (url: string) => Response }) {
  const requested: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requested.push(url);
    if (url.startsWith("https://publish.x.com/oembed"))
      return answers.oEmbed ? Response.json(xOEmbed) : new Response("", { status: 404 });
    return answers.page(url);
  }) as typeof globalThis.fetch;
  return { fetch, requested };
}
const html = (body: string) =>
  new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
const xRequest = { timeoutMs: 4_000, maxBytes: 1_000_000, lookupHost };

test("an X post takes its rich fields from the page and keeps the oEmbed embed", async () => {
  const { fetch } = xFetch({ oEmbed: true, page: () => html(xPage) });
  const article = await ingestXPost(xPostUrl, fetch, xRequest);
  expect(article?.social).toMatchObject({
    provider: "x",
    postId: "301",
    width: 550,
    text: "Tide tables, annotated",
    publishedDate: "2026-10-03T14:05:00.000Z",
    avatarUrl: "https://pbs.twimg.com/profile_images/1/m_x96.jpg",
    media: [{ kind: "photo", alt: "A hand-marked tide chart" }],
  });
  expect(article?.social?.embedHtml).toContain("twitter-tweet");
  expect(article?.text).toBe("Tide tables, annotated\n\nA hand-marked tide chart");
});

test("an X post whose page is a logged-out shell keeps what oEmbed gave it", async () => {
  const { fetch, requested } = xFetch({ oEmbed: true, page: () => html("<html>Log in</html>") });
  const article = await ingestXPost(xPostUrl, fetch, xRequest);
  expect(requested).toContain("https://x.com/i/status/301");
  expect(article?.social).toMatchObject({
    text: "Tide tables, annotated",
    authorName: "Mara Okafor",
  });
  expect(article?.social?.media).toBeUndefined();
  expect(article?.social?.publishedDate).toBe("2026-10-03T00:00:00.000Z");
});

test("an X post is built from its page alone when oEmbed is blocked", async () => {
  const { fetch } = xFetch({
    oEmbed: false,
    // The handle's URL fails; the canonical one answers.
    page: (url) => (url.includes("/i/status/") ? html(xPage) : new Response("", { status: 404 })),
  });
  const article = await ingestXPost(xPostUrl, fetch, xRequest);
  expect(article?.title).toBe("Mara Okafor's post");
  expect(article?.html).toBe("");
  expect(article?.social).toMatchObject({ provider: "x", postUrl: xPostUrl, postId: "301" });
  expect(article?.social?.embedHtml).toBeUndefined();
});

test("an X post with neither source answering falls through to the page pipeline", async () => {
  const { fetch } = xFetch({ oEmbed: false, page: () => new Response("", { status: 404 }) });
  expect(await ingestXPost(xPostUrl, fetch, xRequest)).toBeNull();
});

test("an X page that redirects off X is not followed", async () => {
  const { fetch, requested } = xFetch({
    oEmbed: false,
    page: (url) =>
      url.startsWith("https://x.com/")
        ? new Response(null, { status: 302, headers: { location: "https://example.com/login" } })
        : html(xPage),
  });
  expect(await ingestXPost(xPostUrl, fetch, xRequest)).toBeNull();
  expect(requested.some((url) => url.startsWith("https://example.com/"))).toBe(false);
});
