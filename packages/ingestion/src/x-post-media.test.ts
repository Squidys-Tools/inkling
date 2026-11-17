import { expect, test } from "bun:test";
import { downloadXPostImage, missingXPostMedia, withXPostMediaPaths } from "./x-post-media.ts";
import type { XPostMetadata } from "./types.ts";

const lookupHost = async () => [{ address: "93.184.215.14" }];
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

const post: XPostMetadata = {
  provider: "x",
  postUrl: "https://x.com/mara_okafor/status/1",
  postId: "1",
  avatarUrl: "https://pbs.twimg.com/a.jpg",
  media: [{ kind: "photo", url: "https://pbs.twimg.com/m0", width: 1, height: 1 }],
  linkCard: { url: "https://example.org", imageUrl: "https://pbs.twimg.com/c", large: true },
};

test("a stored copy is recorded only where its slot still shows the URL it came from", () => {
  expect(missingXPostMedia(post).map(({ slot }) => slot)).toEqual(["avatar", "media-0", "card"]);
  const next = withXPostMediaPaths(
    { ...post, avatarUrl: "https://pbs.twimg.com/new-avatar.jpg" },
    new Map([
      ["avatar", { url: "https://pbs.twimg.com/a.jpg", path: "assets/items/i/x-avatar.jpg" }],
      ["media-0", { url: "https://pbs.twimg.com/m0", path: "assets/items/i/x-media-0.jpg" }],
    ]),
  );
  expect(next.avatarPath).toBeUndefined();
  expect(next.media?.[0]?.path).toBe("assets/items/i/x-media-0.jpg");
  expect(missingXPostMedia(next).map(({ slot }) => slot)).toEqual(["avatar", "card"]);
});

test("post pictures come only from X's image CDN, and only as images", async () => {
  const requested: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    requested.push(url);
    if (url.includes("/moved"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/x.jpg" },
      });
    if (url.includes("/html"))
      return new Response("<html>", { headers: { "content-type": "image/jpeg" } });
    return new Response(jpeg, { headers: { "content-type": "image/jpeg" } });
  }) as typeof globalThis.fetch;
  const download = (url: string) => downloadXPostImage(url, { fetch, lookupHost });

  expect(await download("https://pbs.twimg.com/media/A?format=jpg&name=small")).toEqual(jpeg);
  expect(await download("https://pbs.twimg.com/html")).toBeNull();
  await expect(download("https://example.com/x.jpg")).rejects.toMatchObject({ permanent: true });
  await expect(download("https://pbs.twimg.com/moved")).rejects.toMatchObject({ permanent: true });
  expect(requested.some((url) => url.startsWith("https://example.com/"))).toBe(false);
});
