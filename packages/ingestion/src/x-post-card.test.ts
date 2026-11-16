import { expect, test } from "bun:test";
import { xPostCard } from "./x-post-card.ts";

test("a long post's card text stops before an emoji it would split, with the spans inside it", () => {
  // The emoji's two UTF-16 units sit at 999 and 1000, across the 1,000 cut.
  const text = `${"a".repeat(994)}#tag ${"🌊"} @late`;
  const card = xPostCard({
    provider: "x",
    postUrl: "https://x.com/maraokafor/status/1",
    postId: "1",
    text,
    entities: [
      { kind: "hashtag", start: 994, end: 998 },
      { kind: "mention", start: 1002, end: 1007 },
    ],
  });
  expect(card.text).toBe(text.slice(0, 999));
  expect(card.entities).toEqual([{ kind: "hashtag", start: 994, end: 998 }]);
});
