import { expect, test } from "bun:test";
import { embedCandidate } from "./embeds";

const pageUrl = "https://example.com/articles/first";

test.each([
  [
    "https://www.youtube.com/watch?v=abc12345678",
    "https://www.youtube-nocookie.com/embed/abc12345678",
  ],
  ["https://youtu.be/abc12345678", "https://www.youtube-nocookie.com/embed/abc12345678"],
  [
    "https://www.youtube.com/embed/abc12345678",
    "https://www.youtube-nocookie.com/embed/abc12345678",
  ],
  ["https://vimeo.com/123456", "https://player.vimeo.com/video/123456"],
  ["https://www.loom.com/share/abc123", "https://www.loom.com/embed/abc123"],
  ["https://open.spotify.com/track/abc123", "https://open.spotify.com/embed/track/abc123"],
  ["https://w.soundcloud.com/player/?url=x", "https://w.soundcloud.com/player/?url=x"],
  ["https://player.twitch.tv/?channel=x", "https://player.twitch.tv/?channel=x"],
])("iframe %s is rebuilt as %s", (src, embedUrl) => {
  expect(embedCandidate(src, "iframe", pageUrl)?.embedUrl).toBe(embedUrl);
});

test.each([
  "https://www.youtube.com/not-a-video",
  "https://youtu.be/abc12345678/extra",
  "https://www.vimeo.com/123456",
  "https://open.spotify.com/user/abc123",
  "https://soundcloud.com/artist/track",
  "https://player.twitch.tv/",
  "https://evil.example/embed",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
])("iframe %s is refused", (src) => {
  expect(embedCandidate(src, "iframe", pageUrl)).toBeNull();
});

test("direct media passes only as a media file off provider hosts", () => {
  expect(embedCandidate("/media/clip.mp4", "video", pageUrl)?.embedUrl).toBe(
    "https://example.com/media/clip.mp4",
  );
  expect(embedCandidate("https://example.com/talk.mp3?t=1", "audio", pageUrl)?.provider).toBe(
    "direct",
  );
  expect(embedCandidate("https://example.com/not-a-video", "video", pageUrl)).toBeNull();
  expect(embedCandidate("https://www.youtube.com/watch.mp4", "video", pageUrl)).toBeNull();
  expect(embedCandidate("blob:https://example.com/clip.mp4", "video", pageUrl)).toBeNull();
});
