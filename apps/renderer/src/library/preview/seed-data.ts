import type { Job, Space } from "@inkling/contracts";
import type { XPost } from "@inkling/contracts/jobs";

// The demo library's records as data, with file names instead of bundler URLs:
// the web preview (./seed.ts) projects them into cards, and tools/dev writes
// them into a real SQLite library, so both dev modes show the same seed.

export type SeedItem = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  source?: string;
  sourceUrl?: string;
  /** A seed file kept as the item's asset, and for images its thumbnail. */
  file?: string;
  /** A seed file used only as the thumbnail. */
  thumbnailFile?: string;
  /** Who took the photo in `file`; the site's /credits page lists these. */
  credit?: { author: string; url: string };
  hasArticleContent?: boolean;
  /** Also appears once more, archived, as `archive-<id>`. */
  archivedCopy?: boolean;
  /** Stagger slot: createdAt = base - floor(index / 2) days. */
  index: number;
  metadata?: Record<string, unknown>;
  /** Stored as `metadata.social`; its picture paths name seed files, as `file` does. */
  xPost?: XPost;
};

// Real posts, as capture stores them: text, media and cards come from each post's page,
// and the pictures are X's own copies, so the item view's live embed shows the same post.
const xPostItem = (
  slug: string,
  index: number,
  tags: string[],
  post: Omit<XPost, "provider" | "postUrl">,
): SeedItem => {
  const postUrl = `https://x.com/${post.authorHandle}/status/${post.postId}`;
  return {
    id: `seed-x-${slug}`,
    kind: "url",
    title: `${post.authorName}'s post`,
    description: post.text,
    source: "X",
    sourceUrl: postUrl,
    index,
    metadata: { tags: [...tags, "post"] },
    xPost: { provider: "x", postUrl, ...post },
  };
};

const xPosts: SeedItem[] = [
  xPostItem("webb", 2, ["space", "astronomy", "photography"], {
    postId: "1546621144358391808",
    authorName: "NASA",
    authorHandle: "NASA",
    verified: "government",
    avatarUrl: "https://pbs.twimg.com/profile_images/1321163587679784960/0ZxKlEKB_x96.jpg",
    squareAvatar: true,
    authorUrl: "https://x.com/NASA",
    text: "It's here–the deepest, sharpest infrared view of the universe to date: Webb's First Deep Field.\n\nPreviewed by @POTUS on July 11, it shows galaxies once invisible to us. The full set of @NASAWebb's first full-color images & data will be revealed July 12: nasa.gov/webbfirstimages",
    entities: [
      {
        kind: "mention",
        start: 110,
        end: 116,
      },
      {
        kind: "mention",
        start: 185,
        end: 194,
      },
      {
        kind: "url",
        start: 254,
        end: 278,
        url: "http://nasa.gov/webbfirstimages",
      },
    ],
    publishedDate: "2022-07-11T22:23:10.000Z",
    media: [
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/FXazugRWIAQZmml?format=jpg&name=small",
        width: 2799,
        height: 2856,
        alt: "The background of space is black. Thousands of galaxies appear all across the view. Their shapes and colors vary. Some are various shades of orange, others are white. Most stars appear blue, and are sometimes as large as more distant galaxies that appear next to them. A very bright star is just above and left of center. It has eight bright blue, long diffraction spikes. Between 4 o’clock and 6 o’clock in its spikes are several very bright galaxies. A group of three are in the middle, and two are closer to 4 o’clock. These galaxies are part of the galaxy cluster SMACS 0723, and they are warping the appearances of galaxies seen around them. Long orange arcs appear at left and right toward the center.",
        path: "x-1546621144358391808-1.jpg",
      },
    ],
    avatarPath: "x-avatar-nasa.jpg",
  }),
  xPostItem("earthset", 6, ["space", "moon", "video"], {
    postId: "2046009031613907029",
    authorName: "Reid Wiseman",
    authorHandle: "astro_reid",
    avatarUrl: "https://pbs.twimg.com/profile_images/1785338156524457984/4K6iJivI_x96.jpg",
    authorUrl: "https://x.com/astro_reid",
    text: "Only one chance in this lifetime…\n\nLike watching sunset at the beach from the most foreign seat in the cosmos, I couldn’t resist a cell phone video of Earthset. You can hear the shutter on the Nikon as @Astro_Christina is hammering away on 3-shot brackets and capturing those exceptional Earthset photos through the 400mm lens. @AstroVicGlover was in window 3 watching with @Astro_Jeremy next to him. \n\nI could barely see the Moon through the docking hatch window but the iPhone was the perfect size to catch the view…this is uncropped, uncut with 8x zoom which is quite comparable to the view of the human eye. Enjoy.",
    entities: [
      {
        kind: "mention",
        start: 202,
        end: 218,
      },
      {
        kind: "mention",
        start: 328,
        end: 343,
      },
      {
        kind: "mention",
        start: 374,
        end: 387,
      },
    ],
    publishedDate: "2026-04-19T23:32:20.000Z",
    media: [
      {
        kind: "video",
        url: "https://pbs.twimg.com/amplify_video_thumb/2046008958511702016/img/ZVCfSz258kuefu7d?format=jpg&name=small",
        width: 720,
        height: 1280,
        durationSeconds: 53.005,
        path: "x-2046009031613907029-1.jpg",
      },
    ],
    avatarPath: "x-avatar-astro_reid.jpg",
  }),
  xPostItem("crew13", 8, ["space", "launch", "photography"], {
    postId: "2105698284354367897",
    authorName: "NASA",
    authorHandle: "NASA",
    verified: "government",
    avatarUrl: "https://pbs.twimg.com/profile_images/1321163587679784960/0ZxKlEKB_x96.jpg",
    squareAvatar: true,
    authorUrl: "https://x.com/NASA",
    text: "Destination: @Space_Station📍\n\nNASA’s SpaceX Crew-13 mission has successfully launched! The Dragon spacecraft carrying the crew is set to dock at about 7pm ET (2300 UTC) tonight, kicking off several months of scientific exploration. Watch with us here! go.nasa.gov/4xS9r7L",
    entities: [
      {
        kind: "mention",
        start: 13,
        end: 27,
      },
      {
        kind: "url",
        start: 253,
        end: 272,
        url: "https://go.nasa.gov/4xS9r7L",
      },
    ],
    publishedDate: "2026-10-01T16:36:07.000Z",
    media: [
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/HTjxa3eW0AAktku?format=jpg&name=small",
        width: 2048,
        height: 1113,
        alt: "A SpaceX Falcon 9 rocket with the company's Dragon spacecraft on top is seen at sunset on the launch pad. The sky is mostly covered with different kinds of clouds: thick, fluffy ones at the bottom and wider, more spread out ones in the rest of the sky. The Sun's light turns the bottom right portion of the sky orange.",
        path: "x-2105698284354367897-1.jpg",
      },
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/HTjxbFWWMAAJ5fH?format=jpg&name=small",
        width: 2048,
        height: 1432,
        alt: "NASA's SpaceX Crew-13 mission members CSA (Canadian Space Agency) astronaut Joshua Kutryk, left, NASA astronauts Luke Delaney, middle left, and Jessica Watkins, middle right, and Roscosmos cosmonaut Sergey Teteryatnikov, right, wave to a crowd (not seen) after walking out of a building.",
        path: "x-2105698284354367897-2.jpg",
      },
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/HTjxbUzW4AAOYxQ?format=jpg&name=small",
        width: 2048,
        height: 1269,
        alt: "A Crew-13 member waves out of a black Tesla's open window as they proceed to the launch pad. The car's license plate reads \"Lucky 13.\"",
        path: "x-2105698284354367897-3.jpg",
      },
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/HTjxbkAXgAAN6Vy?format=jpg&name=small",
        width: 2048,
        height: 1262,
        alt: "A SpaceX Falcon 9 rocket carrying the company's Dragon spacecraft launches. There is a bright column of fire under the rocket as it moves upward. Clouds of vapor spread out below the rocket, almost blending into the similarly shaped clouds in the sky.",
        path: "x-2105698284354367897-4.jpg",
      },
    ],
    avatarPath: "x-avatar-nasa.jpg",
  }),
  xPostItem("landing", 10, ["space", "mars", "video"], {
    postId: "1363929492138254340",
    authorName: "ARCHIVED - NASA's Perseverance Mars Rover",
    authorHandle: "NASAPersevere",
    verified: "blue",
    avatarUrl: "https://pbs.twimg.com/profile_images/1379527227436531712/QasZP9s-_x96.jpg",
    authorUrl: "https://x.com/NASAPersevere",
    text: "Your front-row seat to my Mars landing is here. Watch how we did it.\n\n#CountdownToMars",
    entities: [
      {
        kind: "hashtag",
        start: 70,
        end: 86,
      },
    ],
    publishedDate: "2021-02-22T19:11:46.000Z",
    media: [
      {
        kind: "video",
        url: "https://pbs.twimg.com/media/Eu2ND-rWgAM-bpS?format=jpg&name=small",
        width: 2782,
        height: 1565,
        durationSeconds: 205.033,
        path: "x-1363929492138254340-1.jpg",
      },
    ],
    avatarPath: "x-avatar-nasapersevere.jpg",
  }),
  xPostItem("first-tweet", 12, ["space", "twitter", "history"], {
    postId: "1789764999231001051",
    authorName: "NASA",
    authorHandle: "NASA",
    verified: "government",
    avatarUrl: "https://pbs.twimg.com/profile_images/1321163587679784960/0ZxKlEKB_x96.jpg",
    squareAvatar: true,
    authorUrl: "https://x.com/NASA",
    text: "15 years ago today, astronaut Mike Massimino wrote the first Tweet in space.\n\nHere's to the many more we've shared since then—around the world and off it:",
    publishedDate: "2024-05-12T21:10:02.000Z",
    quote: {
      postId: "1777093627",
      postUrl: "https://x.com/Astro_Mike/status/1777093627",
      authorName: "Mike Massimino",
      authorHandle: "Astro_Mike",
      verified: "blue",
      avatarUrl: "https://pbs.twimg.com/profile_images/1235606509163352071/yBzfpSOv_normal.jpg",
      text: "From orbit: Launch was awesome!! I am feeling great, working hard, & enjoying the magnificent views, the adventure of a lifetime has begun!",
      publishedDate: "2009-05-12T20:33:01.000Z",
      avatarPath: "x-avatar-astro_mike.jpg",
    },
    avatarPath: "x-avatar-nasa.jpg",
  }),
  xPostItem("smoke", 14, ["earth", "wildfire"], {
    postId: "2077831134700835243",
    authorName: "NASA Earth",
    authorHandle: "NASAEarth",
    verified: "government",
    avatarUrl: "https://pbs.twimg.com/profile_images/2040064373323083776/2ez7ntt1_x96.jpg",
    squareAvatar: true,
    authorUrl: "https://x.com/NASAEarth",
    text: "Learn more: go.nasa.gov/4poBYit",
    entities: [
      {
        kind: "url",
        start: 12,
        end: 31,
        url: "https://go.nasa.gov/4poBYit",
      },
    ],
    publishedDate: "2026-07-16T19:02:01.000Z",
    linkCard: {
      url: "https://go.nasa.gov/4poBYit",
      domain: "science.nasa.gov",
      title: "Ontario Wildfire Smoke Moves East - NASA Science",
      description:
        "Canadian wildfires sent plumes of smoke streaming over Ontario, Quebec, and parts of the U.S. Midwest and Northeast.",
      imageUrl: "https://pbs.twimg.com/card_img/2120476673896509440/AMsWSfbB?format=jpg&name=small",
      imageWidth: 720,
      imageHeight: 377,
      large: true,
      imagePath: "x-2077831134700835243-card.jpg",
    },
    replyTo: {
      postId: "2077831131982901667",
      handle: "NASAEarth",
    },
    avatarPath: "x-avatar-nasaearth.jpg",
  }),
  xPostItem("edit-poll", 16, ["twitter", "poll"], {
    postId: "1511143607385874434",
    authorName: "Elon Musk",
    authorHandle: "elonmusk",
    verified: "blue",
    avatarUrl: "https://pbs.twimg.com/profile_images/2122506092437504001/NSS4RHyZ_x96.jpg",
    authorUrl: "https://x.com/elonmusk",
    text: "Do you want an edit button?",
    publishedDate: "2022-04-05T00:48:06.000Z",
    poll: {
      choices: [
        {
          label: "yse",
          votes: 3241597,
        },
        {
          label: "on",
          votes: 1165167,
        },
      ],
      endsAt: "2022-04-06T00:48:06.000Z",
      final: true,
    },
    avatarPath: "x-avatar-elonmusk.jpg",
  }),
  xPostItem("jezero", 18, ["space", "mars"], {
    postId: "1362508307529785346",
    authorName: "ARCHIVED - NASA's Perseverance Mars Rover",
    authorHandle: "NASAPersevere",
    verified: "blue",
    avatarUrl: "https://pbs.twimg.com/profile_images/1379527227436531712/QasZP9s-_x96.jpg",
    authorUrl: "https://x.com/NASAPersevere",
    text: "And another look behind me. Welcome to Jezero Crater. #CountdownToMars",
    entities: [
      {
        kind: "hashtag",
        start: 54,
        end: 70,
      },
    ],
    publishedDate: "2021-02-18T21:04:29.000Z",
    media: [
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/EuiZrefVEAIc0GO?format=jpg&name=small",
        width: 1280,
        height: 1010,
        path: "x-1362508307529785346-1.jpg",
      },
    ],
    replyTo: {
      postId: "1362507436611956736",
      handle: "NASAPersevere",
    },
    avatarPath: "x-avatar-nasapersevere.jpg",
  }),
  xPostItem("hello-mars", 20, ["space", "mars", "photography"], {
    postId: "1362507436611956736",
    authorName: "ARCHIVED - NASA's Perseverance Mars Rover",
    authorHandle: "NASAPersevere",
    verified: "blue",
    avatarUrl: "https://pbs.twimg.com/profile_images/1379527227436531712/QasZP9s-_x96.jpg",
    authorUrl: "https://x.com/NASAPersevere",
    text: "Hello, world. My first look at my forever home. #CountdownToMars",
    entities: [
      {
        kind: "hashtag",
        start: 48,
        end: 64,
      },
    ],
    publishedDate: "2021-02-18T21:01:01.000Z",
    media: [
      {
        kind: "photo",
        url: "https://pbs.twimg.com/media/EuiZR2xUcAMxfsq?format=jpg&name=small",
        width: 1321,
        height: 952,
        path: "x-1362507436611956736-1.jpg",
      },
    ],
    avatarPath: "x-avatar-nasapersevere.jpg",
  }),
  xPostItem("voyager", 1, ["space", "earth"], {
    postId: "1950540964898189409",
    authorName: "NASA JPL",
    authorHandle: "NASAJPL",
    verified: "government",
    avatarUrl: "https://pbs.twimg.com/profile_images/1967683664789327872/pL3ATPuZ_x96.jpg",
    squareAvatar: true,
    authorUrl: "https://x.com/NASAJPL",
    text: "Our live broadcast may be ending, but NISAR’s journey is just beginning.\n\nGet updates at science.nasa.gov/blogs/nisar",
    entities: [
      {
        kind: "url",
        start: 89,
        end: 117,
        url: "http://science.nasa.gov/blogs/nisar",
      },
    ],
    publishedDate: "2025-07-30T12:56:19.000Z",
    avatarPath: "x-avatar-nasajpl.jpg",
  }),
];

export const seedItems: SeedItem[] = [
  ...xPosts,
  {
    id: "me-fuji-night",
    kind: "image",
    title: "The Matterhorn over the village lights",
    description: "Nightfall with Zermatt glowing below the mountain.",
    source: "Downloads",
    file: "compressO-6248AFB9-CEA1-45EE-944A-06CD88501EF8.jpg",
    index: 0,
    metadata: {
      tags: ["photography", "alps", "landscape", "night"],
      mediaWidth: 4000,
      mediaHeight: 6000,
    },
  },
  {
    id: "me-spidey-rain",
    kind: "image",
    title: "Spider-Man in the rain",
    description: "Crouched on a gargoyle, rain coming down hard.",
    source: "Downloads",
    file: "compressO-IMG_4631.jpg",
    index: 1,
    metadata: { tags: ["comics", "wallpaper"], mediaWidth: 1080, mediaHeight: 1346 },
  },
  {
    id: "me-lanterns",
    kind: "image",
    title: "Lanterns outside the izakaya",
    description: "Warm paper lanterns on a dark Tokyo street.",
    source: "Downloads",
    file: "compressO-6270CBFE-632E-481D-BBE4-D1654635C2E8.jpg",
    index: 2,
    metadata: { tags: ["photography", "japan", "night"], mediaWidth: 6000, mediaHeight: 4000 },
  },
  {
    id: "me-blossoms",
    kind: "image",
    title: "Cherry blossoms, close up",
    description: "Full bloom, almost too pink to be real.",
    source: "Downloads",
    file: "compressO-6E4DB3C2-1738-4956-B1EA-F7B118DA49FD.jpg",
    index: 3,
    metadata: { tags: ["photography", "spring"], mediaWidth: 4000, mediaHeight: 6000 },
  },
  {
    id: "me-clip",
    kind: "video",
    title: "Saved clip",
    description: "A 10-second clip from my downloads.",
    source: "Downloads",
    file: "saved-clip.mp4",
    index: 4,
    metadata: { tags: ["video"], mediaWidth: 1280, mediaHeight: 720 },
  },
  {
    id: "me-fuji-maple",
    kind: "image",
    title: "Fuji through red maples",
    description: "Autumn framing the mountain perfectly.",
    source: "Downloads",
    file: "compressO-BE4813D8-0629-4E79-8DB4-E32B76874B84.jpg",
    index: 5,
    metadata: {
      tags: ["photography", "japan", "landscape"],
      mediaWidth: 3837,
      mediaHeight: 5756,
    },
  },
  {
    id: "me-anime-girl",
    kind: "image",
    title: "Uniform sketch",
    description: "Blonde anime character in a school uniform.",
    source: "Downloads",
    file: "compressO-IMG_3865.jpg",
    index: 6,
    metadata: { tags: ["anime", "illustration"], mediaWidth: 1080, mediaHeight: 1920 },
  },
  {
    id: "me-shoreline",
    kind: "image",
    title: "Where the waves land",
    description: "Aerial shot of surf washing over dark sand.",
    source: "Downloads",
    file: "compressO-D7CF964F-BD6F-427D-BABC-DAF4A39FAAB8.jpg",
    index: 7,
    metadata: {
      tags: ["photography", "ocean", "aerial"],
      mediaWidth: 2334,
      mediaHeight: 2917,
    },
  },
  {
    id: "me-optimus",
    kind: "image",
    title: "Optimus Prime",
    description: "Battle-worn and glowing.",
    source: "Downloads",
    file: "compressO-IMG_4633.jpg",
    index: 8,
    metadata: {
      tags: ["movies", "poster", "reference"],
      mediaWidth: 640,
      mediaHeight: 960,
    },
  },
  {
    id: "me-canyon",
    kind: "image",
    title: "Red rock country",
    description: "Ochre cliffs and scrub, somewhere dry and quiet.",
    source: "Downloads",
    file: "compressO-F5D0F587-A884-4510-BCE5-4D0E04308D62.jpg",
    index: 9,
    metadata: {
      tags: ["photography", "landscape"],
      mediaWidth: 4000,
      mediaHeight: 6000,
    },
  },
  {
    id: "me-batman",
    kind: "image",
    title: "Batman on the bike",
    description: "Minimal poster, all ink and red.",
    source: "Downloads",
    file: "compressO-IMG_4634.jpg",
    index: 10,
    metadata: {
      tags: ["movies", "poster", "reference"],
      mediaWidth: 1080,
      mediaHeight: 1920,
    },
  },
  {
    id: "me-branch",
    kind: "image",
    title: "First blossom",
    description: "One white branch against the green blur.",
    source: "Downloads",
    file: "compressO-9BCD88C1-AFC4-483B-9A33-7C6F292BFBB2.jpg",
    index: 11,
    metadata: {
      tags: ["photography", "spring"],
      mediaWidth: 2832,
      mediaHeight: 4248,
    },
  },
  {
    id: "me-anime-boy",
    kind: "image",
    title: "Track jacket",
    description: "Anime character adjusting his collar.",
    source: "Downloads",
    file: "compressO-IMG_3921.jpg",
    index: 12,
    metadata: { tags: ["anime", "illustration"], mediaWidth: 1200, mediaHeight: 1991 },
  },
  {
    id: "me-building",
    kind: "image",
    title: "The brick corner",
    description: "A historic corner building looking over the street.",
    source: "Downloads",
    file: "compressO-A247AFD7-6871-4B6B-98B7-CDD69736409F.jpg",
    index: 13,
    metadata: {
      tags: ["photography", "architecture", "city"],
      mediaWidth: 3930,
      mediaHeight: 5895,
    },
  },
  {
    id: "me-spidey-mask",
    kind: "image",
    title: "Eye lenses",
    description: "Extreme close-up on the mask.",
    source: "Downloads",
    file: "compressO-IMG_4632.jpg",
    index: 14,
    metadata: { tags: ["movies", "wallpaper"], mediaWidth: 623, mediaHeight: 1350 },
  },
  {
    id: "me-valley",
    kind: "image",
    title: "River through the valley",
    description: "Green ridges and a winding river below.",
    source: "Camera roll",
    file: "compressO-IMG_2618.jpg",
    index: 15,
    metadata: { tags: ["photography", "landscape"], mediaWidth: 1080, mediaHeight: 1920 },
  },
  {
    id: "me-fort",
    kind: "image",
    title: "The fort on the water",
    description: "Stone walls right at the edge of the sea.",
    source: "Downloads",
    file: "compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg",
    index: 16,
    metadata: { tags: ["photography", "travel"], mediaWidth: 1967, mediaHeight: 2934 },
  },
  {
    id: "me-mockups",
    kind: "image",
    title: "Music app screens",
    description: "Five phone mockups with different player themes.",
    source: "Camera roll",
    file: "compressO-IMG_4637.jpg",
    index: 17,
    metadata: { tags: ["ui", "reference", "design"], mediaWidth: 2000, mediaHeight: 2000 },
  },
  {
    id: "me-cliffs",
    kind: "image",
    title: "Cliffs at golden hour",
    description: "The coast glowing before sunset.",
    source: "Downloads",
    file: "compressO-D2BD78FD-1D0F-4124-BAF0-C65065F12791.jpg",
    index: 18,
    metadata: { tags: ["photography", "ocean", "travel"], mediaWidth: 4000, mediaHeight: 6000 },
  },
  {
    id: "me-shark",
    kind: "image",
    title: "Shark, passing by",
    description: "Underwater and unbothered.",
    source: "Camera roll",
    file: "compressO-IMG_4635.jpg",
    index: 19,
    metadata: { tags: ["photography", "ocean", "wildlife"], mediaWidth: 736, mediaHeight: 1308 },
  },
  {
    id: "me-silk",
    kind: "image",
    title: "Black silk",
    description: "Dark abstract wallpaper material.",
    source: "Camera roll",
    file: "compressO-IMG_4630.jpg",
    index: 20,
    metadata: { tags: ["abstract", "wallpaper"], mediaWidth: 650, mediaHeight: 1156 },
  },
  {
    id: "me-film-still",
    kind: "image",
    title: "Period film still",
    description: "Three men in vintage dress, mid-conversation.",
    source: "Camera roll",
    file: "compressO-IMG_4636.jpg",
    index: 21,
    metadata: { tags: ["movies", "reference"], mediaWidth: 736, mediaHeight: 485 },
  },
  {
    id: "me-icons",
    kind: "image",
    title: "Icon set exploration",
    description: "Weather and action icons in a few colorways.",
    source: "Camera roll",
    file: "compressO-IMG_4638.jpg",
    index: 22,
    metadata: { tags: ["ui", "reference", "design"], mediaWidth: 1200, mediaHeight: 672 },
  },
  {
    id: "me-f1",
    kind: "image",
    title: "Remaining races",
    description: "Night-race graphic counting down the season.",
    source: "Camera roll",
    file: "compressO-IMG_4640.jpg",
    index: 23,
    metadata: { tags: ["racing", "reference", "design"], mediaWidth: 1080, mediaHeight: 1350 },
  },
  {
    id: "5",
    kind: "url",
    title: "The first post on Twitter",
    description: "A two-word product launch document from the first day of Twitter.",
    source: "X",
    sourceUrl: "https://x.com/jack/status/20",
    archivedCopy: true,
    index: 3,
    metadata: {
      tags: ["twitter", "history", "post"],
      social: {
        provider: "x",
        postUrl: "https://x.com/jack/status/20",
        postId: "20",
        authorName: "jack",
        authorHandle: "jack",
        text: "just setting up my twttr",
        publishedDate: "2006-03-21T20:50:14.000Z",
      },
    },
  },
  {
    id: "10",
    kind: "pdf",
    title: "Attention Is All You Need.pdf",
    description:
      "The transformer paper. Eight authors, one architecture, and the beginning of everything since.",
    source: "arXiv",
    sourceUrl: "https://arxiv.org/abs/1706.03762",
    archivedCopy: true,
    index: 9,
    metadata: { tags: ["research", "ml"], pdfPageCount: 15 },
  },
  {
    id: "12",
    kind: "note",
    title: "Books to reread this fall",
    description:
      "Pilgrim at Tinker Creek, The Design of Everyday Things, Seeing Like a State. Start with the Dillard.",
    archivedCopy: true,
    index: 1,
    metadata: { tags: ["books", "life"] },
  },
  {
    id: "13",
    kind: "quote",
    title: "“It is not that we have a short time to live, but that we waste a lot of it.”",
    description: "— Seneca",
    source: "On the Shortness of Life",
    sourceUrl: "https://en.wikisource.org/wiki/Of_The_Shortness_of_Life/Chapter_1",
    index: 5,
    metadata: { tags: ["writing", "time"] },
  },
  {
    id: "preview-article",
    kind: "article",
    title: "The Hundred-Year Language",
    description: "What programming languages will look like in a hundred years.",
    source: "paulgraham.com",
    sourceUrl: "https://paulgraham.com/hundred.html",
    hasArticleContent: true,
    index: 2,
    metadata: { tags: ["essay", "programming"], readingMinutes: 14 },
  },
  {
    id: "preview-article-image",
    kind: "article",
    title: "Notes on a quiet harbor town",
    description: "A slow travel piece about a fortress, a lighthouse and the tide.",
    source: "example.com",
    sourceUrl: "https://example.com/travel/harbor-town",
    thumbnailFile: "compressO-BD0448C2-54B5-4791-B6EF-05629CA6C40C.jpg",
    hasArticleContent: true,
    index: 7,
    metadata: { tags: ["essay", "travel"], readingMinutes: 6 },
  },
  {
    id: "preview-file",
    kind: "file",
    title: "household-budget-2026.xlsx",
    source: "Downloads",
    index: 11,
    metadata: { tags: ["finance"], fileSizeBytes: 48_213 },
  },
  {
    id: "preview-video-link",
    kind: "article",
    title: "Bret Victor — Inventing on Principle",
    description: "A talk about tools that give creators an immediate connection to what they make.",
    source: "youtube.com",
    sourceUrl: "https://www.youtube.com/watch?v=PUv66718DII",
    index: 13,
    metadata: { tags: ["talk", "design"], mediaWidth: 480, mediaHeight: 360 },
  },
];

export const seedBodies: Record<string, string> = {
  "12": "# Books to reread this fall\n\n- [ ] Pilgrim at Tinker Creek\n- [ ] The Design of Everyday Things\n- [ ] Seeing Like a State\n\nStart with the Dillard.",
};

// Article HTML for the reader, which the library keeps off the card and the item record.
export const seedArticles: Record<string, string> = {
  "preview-article-image": [
    '<p class="article-lede">The fortress wall still holds the harbor, though the guns are long gone.</p>',
    "<p>Mornings start at the lighthouse, where the tide decides how far you can walk. By noon the fishing boats are in and the town smells of salt and diesel.</p>",
    "<h2>The walk to the light</h2>",
    "<p>A footpath runs along the breakwater. At low tide it is dry the whole way; at high tide the last stretch is a wade.</p>",
    '<figure><iframe src="https://www.youtube.com/watch?v=PUv66718DII" title="A harbor at dawn"></iframe><figcaption>Footage the writer linked from the piece.</figcaption></figure>',
    "<blockquote><p>Nothing here hurries, except the tide.</p></blockquote>",
    "<p>Evenings belong to the square, where the café tables spill over the cobbles and nobody checks the time.</p>",
  ].join(""),
};

export const seedSpaces: Space[] = [
  {
    id: "seed-design-references",
    name: "Design references",
    color: "orange",
    query: { tag: "reference" },
    kind: "smart",
    position: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-read-later",
    name: "Read later",
    color: "green",
    query: { tag: "essay" },
    kind: "smart",
    position: 2,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "seed-weekend-reading",
    name: "Weekend reading",
    color: "pink",
    query: {},
    kind: "regular",
    position: 3,
    createdAt: 0,
    updatedAt: 0,
  },
];

export const seedMembership: Record<string, string[]> = {
  "seed-weekend-reading": ["5", "13"],
};

/** One card mid-processing and one with a failed job, so both states show in the preview. */
export const seedJobs: { itemId: string; status: Job["status"] }[] = [
  { itemId: "preview-article", status: "processing" },
  { itemId: "preview-file", status: "failed" },
];
