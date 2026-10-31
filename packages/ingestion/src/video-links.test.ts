import { expect, test } from "bun:test";
import { videoLinkFromSourceUrl } from "./video-links.ts";

test("video pages become video links with a rebuilt embed URL", () => {
  expect(videoLinkFromSourceUrl(" https://www.youtube.com/watch?v=abc12345678 ")).toEqual({
    provider: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/abc12345678",
    sourceUrl: "https://www.youtube.com/watch?v=abc12345678",
    posterUrl: "https://i.ytimg.com/vi/abc12345678/hqdefault.jpg",
  });
  expect(videoLinkFromSourceUrl("https://youtu.be/abc12345678")?.embedUrl).toBe(
    "https://www.youtube-nocookie.com/embed/abc12345678",
  );
  expect(videoLinkFromSourceUrl("https://m.youtube.com/shorts/abc12345678")?.provider).toBe(
    "youtube",
  );
  expect(videoLinkFromSourceUrl("https://vimeo.com/channels/staffpicks/123456")).toEqual({
    provider: "vimeo",
    embedUrl: "https://player.vimeo.com/video/123456",
    sourceUrl: "https://vimeo.com/channels/staffpicks/123456",
  });
});

test.each([
  "https://example.com/articles/first",
  "https://youtube.com/channel/xyz",
  "https://www.youtube.com/watch?v=short",
  "https://vimeo.com/about",
  "http://www.youtube.com/watch?v=abc12345678",
  "https://www.youtube.com:8443/watch?v=abc12345678",
  "https://user:pass@www.youtube.com/watch?v=abc12345678",
  "javascript:alert(1)",
  "",
])("%s stays an ordinary link", (url) => {
  expect(videoLinkFromSourceUrl(url)).toBeNull();
});
