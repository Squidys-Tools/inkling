import { expect, test } from "bun:test";
import { normalizeXPostOEmbed, parseXPostUrl } from "./x-post";

const postUrl = "https://x.com/jack/status/20";

test("only post URLs on X hosts are posts", () => {
  expect(parseXPostUrl(`${postUrl}#reply`)).toEqual({
    postUrl,
    postId: "20",
    authorHandle: "jack",
  });
  expect(parseXPostUrl("https://twitter.com/i/web/status/20")?.authorHandle).toBeUndefined();
  expect(parseXPostUrl("https://x.com/jack")).toBeNull();
  expect(parseXPostUrl("https://x.com/jack/status/abc")).toBeNull();
  expect(parseXPostUrl("https://example.com/jack/status/20")).toBeNull();
});

test("the oEmbed response becomes post metadata with cleaned embed markup", () => {
  const post = normalizeXPostOEmbed(postUrl, {
    html: `<blockquote class="twitter-tweet" data-dnt="true"><p lang="en">just setting up my twttr</p>&mdash; jack (@jack) <a href="${postUrl}">March 21, 2006</a></blockquote><script src="https://platform.twitter.com/widgets.js"></script>`,
    author_name: "jack",
    author_url: "https://x.com/jack",
    width: 550,
  });
  expect(post).toMatchObject({
    provider: "x",
    postId: "20",
    authorName: "jack",
    authorHandle: "jack",
    text: "just setting up my twttr",
    width: 550,
  });
  expect(post?.embedHtml).not.toContain("<script");
  expect(normalizeXPostOEmbed(postUrl, { html: "<p>not a tweet</p>" })).toBeNull();
});
