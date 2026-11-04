import { expect, test } from "bun:test";
import { ingestVideoLink } from "./oembed.ts";
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
