import parity from "../fixtures/storage-parity.json";
import type { TestLibrary } from "./test-library.ts";

const seedItems = [
  {
    id: "me-fuji-night",
    title: "Fuji over the village lights",
    description: "Nightfall with the town glowing below the mountain.",
    tags: ["photography", "japan", "landscape"],
  },
  {
    id: "me-spidey-rain",
    title: "Spider-Man in the rain",
    description: "Crouched on a gargoyle, rain coming down hard.",
    tags: ["comics", "wallpaper"],
  },
  {
    id: "me-lanterns",
    title: "Lanterns outside the izakaya",
    description: "Warm paper lanterns on a dark Tokyo street.",
    tags: ["photography", "japan", "night"],
  },
  {
    id: "me-blossoms",
    title: "Cherry blossoms, close up",
    description: "Full bloom, almost too pink to be real.",
    tags: ["photography", "spring"],
  },
];

// Apart from test-helpers.ts so only the tests that seed load these rows.
export function seedFromDemo(library: TestLibrary) {
  const selected = seedItems.filter((item) => parity.sourceIds.includes(item.id));
  const insert = library.db
    .prepare(`INSERT INTO items (id, kind, title, description, body, body_format,
    source_label, metadata, ocr_text, created_at, updated_at)
    VALUES (?, 'image', ?, ?, '', 'md', 'Downloads', ?, '', ?, ?)`);
  selected.forEach((item, index) => {
    const now = index + 1;
    insert.run(
      item.id,
      item.title,
      item.description,
      JSON.stringify({ tags: item.tags }),
      now,
      now,
    );
  });
  return selected;
}
