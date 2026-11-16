import { expect, test } from "bun:test";
import {
  avatarVariantUrl,
  extractXPostPayloads,
  mediaVariantUrl,
  xPostFromPage,
  xPostSearchText,
} from "./x-post-page.ts";

// Every account and post here is invented.
const CREATED = Date.UTC(2026, 9, 3, 14, 5);

function user(name: string, handle: string, extra: Record<string, unknown> = {}) {
  return {
    core: { name, screen_name: handle },
    avatar: { image_url: `https://pbs.twimg.com/profile_images/1/${handle}_normal.jpg` },
    verification: { is_blue_verified: false },
    ...extra,
  };
}

function tweet(id: string, text: string, extra: Record<string, unknown> = {}) {
  const { details, ...rest } = extra;
  return {
    __typename: "Tweet",
    rest_id: id,
    details: {
      full_text: text,
      display_text_range: [0, Array.from(text).length],
      created_at_ms: CREATED,
      ...(details as object),
    },
    core: { user_results: { result: user("Mara Okafor", "mara_okafor") } },
    ...rest,
  };
}

// The page carries each payload as JSON inside a script's string literal.
const page = (...payloads: unknown[]) =>
  `<html><head><script nonce="n">self.__a = ${JSON.stringify(
    JSON.stringify({ data: payloads }),
  )};</script></head><body>"full_text" is not JSON here</body></html>`;

const photo = (id: string, extra: Record<string, unknown> = {}) => ({
  type: "photo",
  media_url_https: `https://pbs.twimg.com/media/${id}.jpg`,
  original_info: { width: 4032, height: 3024 },
  ...extra,
});

test("a short post keeps its text, author and time, with links in their display form", () => {
  const text =
    "🌅 Heron at the reservoir &amp; mist. Thanks @tomas_rey #fieldnotes $INKL https://t.co/aB1";
  const post = xPostFromPage(
    page(
      tweet("101", text, {
        url_entities: [
          {
            url: "https://t.co/aB1",
            expanded_url: "https://example.org/notes/heron?ref=x",
            display_url: "example.org/notes/heron…",
          },
        ],
      }),
    ),
    "101",
  );
  const shown =
    "🌅 Heron at the reservoir & mist. Thanks @tomas_rey #fieldnotes $INKL example.org/notes/heron…";
  const span = (part: string) => ({
    start: shown.indexOf(part),
    end: shown.indexOf(part) + part.length,
  });
  expect(post).toEqual({
    authorName: "Mara Okafor",
    authorHandle: "mara_okafor",
    authorUrl: "https://x.com/mara_okafor",
    avatarUrl: "https://pbs.twimg.com/profile_images/1/mara_okafor_x96.jpg",
    verified: undefined,
    squareAvatar: undefined,
    text: shown,
    entities: [
      { kind: "mention", ...span("@tomas_rey") },
      { kind: "hashtag", ...span("#fieldnotes") },
      { kind: "cashtag", ...span("$INKL") },
      {
        kind: "url",
        ...span("example.org/notes/heron…"),
        url: "https://example.org/notes/heron?ref=x",
      },
    ],
    publishedDate: "2026-10-03T14:05:00.000Z",
  });
});

test("a long post is read from its note, not from the cut timeline text", () => {
  const note = `${"A slow walk through the archive. ".repeat(12)}Full list: https://t.co/Long1`;
  const post = xPostFromPage(
    page(
      tweet("102", "A slow walk through the archive… https://t.co/Cut", {
        note_tweet: {
          note_tweet_results: {
            result: {
              text: note,
              entity_set: {
                urls: [
                  {
                    url: "https://t.co/Long1",
                    expanded_url: "https://example.org/archive",
                    display_url: "example.org/archive",
                  },
                ],
              },
            },
          },
        },
      }),
    ),
    "102",
  );
  expect(post?.text).toBe(
    `${"A slow walk through the archive. ".repeat(12)}Full list: example.org/archive`,
  );
  expect(post?.entities).toEqual([
    {
      kind: "url",
      start: post!.text!.indexOf("example.org"),
      end: post!.text!.length,
      url: "https://example.org/archive",
    },
  ]);
});

test("photos are the card-sized variant, at most four, and their own trailing link is hidden", () => {
  const post = xPostFromPage(
    page(
      tweet("103", "Four rooms, four lamps https://t.co/Ph1", {
        url_entities: [
          {
            url: "https://t.co/Ph1",
            expanded_url: "https://x.com/mara_okafor/status/103/photo/1",
            display_url: "pic.x.com/Ph1",
          },
        ],
        media_entities2: [
          photo("A1", { ext_alt_text: "A brass lamp &amp; a chair" }),
          photo("A2"),
          photo("Bad", { original_info: { width: 0, height: 0 } }),
          photo("A3"),
          photo("A4"),
          photo("A5"),
        ],
      }),
    ),
    "103",
  );
  expect(post?.text).toBe("Four rooms, four lamps");
  expect(post?.entities).toBeUndefined();
  expect(post?.media?.map((media) => media.url)).toEqual(
    ["A1", "A2", "A3", "A4"].map((id) => `https://pbs.twimg.com/media/${id}?format=jpg&name=small`),
  );
  expect(post?.media?.[0]).toEqual({
    kind: "photo",
    url: "https://pbs.twimg.com/media/A1?format=jpg&name=small",
    width: 4032,
    height: 3024,
    alt: "A brass lamp & a chair",
  });
});

test("a video and a GIF keep their poster, size and running time", () => {
  const post = xPostFromPage(
    page(
      tweet("104", "Tide coming in", {
        media_entities2: [
          {
            type: "video",
            media_url_https: "https://pbs.twimg.com/ext_tw_video_thumb/9/pu/img/Vid.jpg",
            original_info: { width: 1920, height: 1080 },
            video_info: { duration_millis: 42_500 },
          },
          {
            type: "animated_gif",
            media_url_https: "https://pbs.twimg.com/tweet_video_thumb/Gif.jpg",
            original_info: { width: 480, height: 270 },
          },
        ],
      }),
    ),
    "104",
  );
  expect(post?.media).toEqual([
    {
      kind: "video",
      url: "https://pbs.twimg.com/ext_tw_video_thumb/9/pu/img/Vid?format=jpg&name=small",
      width: 1920,
      height: 1080,
      durationSeconds: 42.5,
    },
    {
      kind: "gif",
      url: "https://pbs.twimg.com/tweet_video_thumb/Gif?format=jpg&name=small",
      width: 480,
      height: 270,
    },
  ]);
});

test("a quote comes from whichever slot has the real copy, and its permalink leaves the text", () => {
  const quoted = tweet("90", "Paper maps still win offline https://t.co/Qp", {
    core: { user_results: { result: user("Ines Lund", "ines_lund") } },
    url_entities: [
      {
        url: "https://t.co/Qp",
        expanded_url: "https://x.com/ines_lund/status/90/photo/1",
        display_url: "pic.x.com/Qp",
      },
    ],
    media_entities2: [photo("Map")],
  });
  const post = xPostFromPage(
    page(
      tweet("105", "Still true. https://t.co/Q1", {
        url_entities: [
          {
            url: "https://t.co/Q1",
            expanded_url: "https://twitter.com/ines_lund/status/90?s=20",
            display_url: "x.com/ines_lund/stat…",
          },
        ],
        quoted_tweet_results: { result: { __typename: "Tweet", rest_id: "90" } },
        nested_quoted_tweet_results: { result: quoted },
      }),
    ),
    "105",
  );
  expect(post?.text).toBe("Still true.");
  expect(post?.quote).toEqual({
    postId: "90",
    postUrl: "https://x.com/ines_lund/status/90",
    authorName: "Ines Lund",
    authorHandle: "ines_lund",
    avatarUrl: "https://pbs.twimg.com/profile_images/1/ines_lund_normal.jpg",
    verified: undefined,
    squareAvatar: undefined,
    text: "Paper maps still win offline",
    media: [
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/Map?format=jpg&name=small",
        width: 4032,
        height: 3024,
      },
    ],
    publishedDate: "2026-10-03T14:05:00.000Z",
  });
  expect(post?.linkCard).toBeUndefined();
});

test("a link card is read from the post's own card values", () => {
  const card = (key: string, value: Record<string, unknown>) => ({ key, value });
  const post = xPostFromPage(
    page(
      tweet("106", "Notes on margins https://t.co/Ln", {
        url_entities: [
          {
            url: "https://t.co/Ln",
            expanded_url: "https://example.org/essays/margins",
            display_url: "example.org/essays/margins",
          },
        ],
        card: {
          legacy: {
            name: "summary_large_image",
            binding_values: [
              card("card_url", { string_value: "https://t.co/Ln" }),
              card("title", { string_value: "On margins &amp; marginalia" }),
              card("description", { string_value: "Why the edge of the page matters." }),
              card("vanity_url", { string_value: "example.org" }),
              card("photo_image_full_size_large", {
                image_value: {
                  url: "https://pbs.twimg.com/card_img/7/Crd?format=jpg&name=800x419",
                  width: 800,
                  height: 419,
                },
              }),
            ],
          },
        },
      }),
    ),
    "106",
  );
  expect(post?.linkCard).toEqual({
    url: "https://example.org/essays/margins",
    domain: "example.org",
    title: "On margins & marginalia",
    description: "Why the edge of the page matters.",
    imageUrl: "https://pbs.twimg.com/card_img/7/Crd?format=jpg&name=small",
    imageWidth: 800,
    imageHeight: 419,
    large: true,
  });
});

test("a poll keeps its choices, counts, end and whether it closed", () => {
  const post = xPostFromPage(
    page(
      tweet("107", "Best desk light?", {
        card: {
          name: "poll3choice_text_only",
          binding_values: {
            choice1_label: { string_value: "Window" },
            choice1_count: { string_value: "41" },
            choice2_label: { string_value: "Lamp" },
            choice2_count: { string_value: "12" },
            choice3_label: { string_value: "Screen glow" },
            choice3_count: { string_value: "3" },
            end_datetime_utc: { string_value: "2026-10-04T14:05:00Z" },
            counts_are_final: { boolean_value: true },
          },
        },
      }),
    ),
    "107",
  );
  expect(post?.poll).toEqual({
    choices: [
      { label: "Window", votes: 41 },
      { label: "Lamp", votes: 12 },
      { label: "Screen glow", votes: 3 },
    ],
    endsAt: "2026-10-04T14:05:00.000Z",
    final: true,
  });
  expect(post?.linkCard).toBeUndefined();
});

test("a reply drops the leading mention X hides and keeps who it answers", () => {
  // The range starts at the space after the mention, so the link's span must shift with the trim.
  const text = "@ines_lund  Agreed, the blue one https://t.co/Rp";
  const post = xPostFromPage(
    page(
      tweet("108", text, {
        details: {
          display_text_range: [10, Array.from(text).length],
          in_reply_to_status_id_str: "90",
          in_reply_to_screen_name: "ines_lund",
        },
        url_entities: [
          {
            url: "https://t.co/Rp",
            expanded_url: "https://example.org/blue",
            display_url: "example.org/blue",
          },
        ],
      }),
    ),
    "108",
  );
  expect(post?.text).toBe("Agreed, the blue one example.org/blue");
  expect(post?.entities).toEqual([
    { kind: "url", start: 21, end: 37, url: "https://example.org/blue" },
  ]);
  expect(post?.replyTo).toEqual({ postId: "90", handle: "ines_lund" });
});

test("a business account keeps its badge and square avatar, merged from a slim copy", () => {
  const rich = tweet("109", "Spring catalogue is out", {
    core: {
      user_results: {
        result: user("Field Notes &amp; Co", "fieldnotes_co", {
          avatar: { image_url: "https://pbs.twimg.com/profile_images/2/logo_400x400.png" },
          verification: { verified_type: "Business", is_blue_verified: true },
        }),
      },
    },
  });
  const slim = {
    __typename: "Tweet",
    rest_id: "109",
    details: { full_text: "Spring catalogue is out" },
    profile_image_shape: "Square",
  };
  const other = tweet("110", "Unrelated post in the same page");
  const html = page(slim, rich, other);
  expect(extractXPostPayloads(html).map((payload) => payload.rest_id)).toEqual(["109", "110"]);
  const post = xPostFromPage(html, "109");
  expect(post).toMatchObject({
    authorName: "Field Notes & Co",
    verified: "business",
    squareAvatar: true,
    avatarUrl: "https://pbs.twimg.com/profile_images/2/logo_x96.png",
  });
});

test("a page without the post, or with unreadable payloads, gives nothing", () => {
  expect(xPostFromPage(page(tweet("111", "Someone else")), "112")).toBeNull();
  expect(xPostFromPage(`<script>x = "{\\"full_text\\": broken"</script>`, "112")).toBeNull();
  expect(xPostFromPage("<html>Log in to X</html>", "112")).toBeNull();
});

test.each([
  [
    "https://pbs.twimg.com/media/Abc.jpg",
    "small",
    "https://pbs.twimg.com/media/Abc?format=jpg&name=small",
  ],
  [
    "https://pbs.twimg.com/media/Abc?format=png&name=orig",
    "small",
    "https://pbs.twimg.com/media/Abc?format=jpg&name=small",
  ],
  ["https://cdn.example.org/a.jpg", "small", "https://cdn.example.org/a.jpg"],
  ["http://pbs.twimg.com/media/Abc.jpg", "small", undefined],
  ["not a url", "small", undefined],
])("media %s at %s is %s", (base, variant, expected) => {
  expect(mediaVariantUrl(base, variant)).toBe(expected);
});

test.each([
  [
    "https://pbs.twimg.com/profile_images/1/me_400x400.jpg",
    "_x96",
    "https://pbs.twimg.com/profile_images/1/me_x96.jpg",
  ],
  [
    "https://pbs.twimg.com/profile_images/1/me_normal.png",
    "_normal",
    "https://pbs.twimg.com/profile_images/1/me_normal.png",
  ],
  [
    "https://pbs.twimg.com/profile_images/1/me.jpg",
    "_x96",
    "https://pbs.twimg.com/profile_images/1/me?format=jpg&name=96x96",
  ],
])("avatar %s at %s is %s", (base, variant, expected) => {
  expect(avatarVariantUrl(base, variant)).toBe(expected);
});

test("search text carries the quote, card, poll and alt text", () => {
  expect(
    xPostSearchText({
      provider: "x",
      postUrl: "https://x.com/mara_okafor/status/1",
      postId: "1",
      text: "Still true.",
      media: [{ kind: "photo", url: "u", width: 1, height: 1, alt: "A brass lamp" }],
      quote: {
        postId: "2",
        postUrl: "u",
        authorName: "Ines Lund",
        authorHandle: "ines_lund",
        text: "Paper maps",
      },
      linkCard: { url: "u", domain: "example.org", title: "On margins", large: false },
      poll: { choices: [{ label: "Window" }, { label: "Lamp" }], final: false },
    }),
  ).toBe(
    "Still true.\n\nA brass lamp\n\nInes Lund @ines_lund Paper maps\n\nOn margins example.org\n\nWindow\n\nLamp",
  );
});
