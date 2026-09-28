import { expect, test } from "bun:test";
import { videoCardImage, videoLinkFromSourceUrl } from "./video-links";

// A video page's og:image is the provider logo, not the video. That regression
// shipped a YouTube logo on every saved video card.
test("a saved video card prefers the derived poster over the page og:image", () => {
  const link = videoLinkFromSourceUrl("https://www.youtube.com/watch?v=PUv66718DII");
  expect(link?.posterUrl).toBe("https://i.ytimg.com/vi/PUv66718DII/hqdefault.jpg");

  // og:image on a YouTube watch page is the YouTube wordmark.
  const pageImage = "https://www.youtube.com/img/yt_1200.png";
  expect(videoCardImage(link?.posterUrl, pageImage)).toBe(link?.posterUrl);
});

test("non-video items keep the page image when there is no poster", () => {
  expect(videoCardImage(undefined, "https://example.com/hero.jpg")).toBe("https://example.com/hero.jpg");
  expect(videoCardImage(undefined, undefined)).toBeUndefined();
});

test("Vimeo has no derived poster, so the page image stands", () => {
  const link = videoLinkFromSourceUrl("https://vimeo.com/123456789");
  expect(link?.provider).toBe("vimeo");
  expect(link?.posterUrl).toBeUndefined();
  expect(videoCardImage(link?.posterUrl, "https://example.com/poster.jpg")).toBe(
    "https://example.com/poster.jpg",
  );
});
