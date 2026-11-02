import { expect, test } from "bun:test";
import { xPostFrameUrl } from "@inkling/ingestion/frame-origins";
import { videoLinkFromSourceUrl } from "@inkling/ingestion/video-links";
import { frameReferer } from "./frame-referer.ts";

const embedUrl = videoLinkFromSourceUrl("https://youtu.be/abc12345678")?.embedUrl;
if (!embedUrl) throw new Error("A YouTube link must produce an embed URL.");

test("a request the app page cannot identify gets the site's Referer", () => {
  expect(frameReferer(embedUrl, "app://local/")).toBe("https://getinkling.dev/");
  expect(frameReferer(embedUrl, "")).toBe("https://getinkling.dev/");
  expect(frameReferer(embedUrl, undefined)).toBe("https://getinkling.dev/");
});

test("a request that already identifies itself keeps its Referer", () => {
  expect(frameReferer(embedUrl, "http://localhost:5173/")).toBeNull();
  expect(frameReferer(embedUrl, `${new URL(embedUrl).origin}/`)).toBeNull();
});

test("other frame hosts are untouched, including the frame that wants no referrer", () => {
  expect(frameReferer(xPostFrameUrl("20"), "")).toBeNull();
  expect(frameReferer("https://player.vimeo.com/video/123456", "app://local/")).toBeNull();
});
