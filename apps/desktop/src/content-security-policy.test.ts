import { expect, test } from "bun:test";
import { embedCandidate } from "@inkling/ingestion/embeds";
import { xPostFrameUrl } from "@inkling/ingestion/frame-origins";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { contentSecurityPolicy } from "./content-security-policy.ts";

function directive(name: string) {
  const entry = contentSecurityPolicy.split("; ").find((part) => part.startsWith(`${name} `));
  return entry?.split(" ").slice(1) ?? [];
}

test("the app document runs only its own script and frames every embed it builds", () => {
  expect(directive("script-src")).toEqual(["'self'"]);
  const frameUrls = [
    ...[
      "https://www.youtube.com/watch?v=abc12345678",
      "https://www.vimeo.com/123456",
      "https://www.loom.com/share/abc123",
      "https://open.spotify.com/track/abc123",
      "http://w.soundcloud.com/player/?url=x",
      "https://player.twitch.tv:8443/?channel=x",
    ].map((src) => embedCandidate(src, "iframe", "https://example.com/")?.embedUrl),
    videoLinkFromSourceUrl("https://youtu.be/abc12345678")?.embedUrl,
    videoLinkFromSourceUrl("https://vimeo.com/123456")?.embedUrl,
    xPostFrameUrl("20"),
  ];
  for (const url of frameUrls) {
    if (!url) throw new Error("An embed URL was refused.");
    expect(directive("frame-src")).toContain(new URL(url).origin);
  }
});
