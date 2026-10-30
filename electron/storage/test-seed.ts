import { personalSeedItems } from "../../src/seedPersonal";
import parity from "../fixtures/storage-parity.json";
import type { TestLibrary } from "./test-library.ts";

// Apart from test-helpers.ts so only the tests that seed load the demo data.
export function seedFromDemo(library: TestLibrary) {
  const selected = personalSeedItems.filter((item) => parity.sourceIds.includes(String(item.id)));
  const insert = library.db
    .prepare(`INSERT INTO items (id, kind, title, description, body, body_format,
    source_label, metadata, ocr_text, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', 'md', 'Downloads', ?, '', ?, ?)`);
  selected.forEach((item, index) => {
    const now = index + 1;
    insert.run(
      item.id,
      item.kind.toLowerCase(),
      item.title,
      item.description,
      JSON.stringify({ tags: item.tags }),
      now,
      now,
    );
  });
  return selected;
}
