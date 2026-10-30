import { createAiJobProcessors } from "../ai-jobs.ts";
import { openTestLibrary } from "../storage/test-library.ts";

// This child is deliberately killed by indexing-restart.test.ts after the
// production processor has committed an image vector but not its text index.
const databasePath = process.argv[2];
if (!databasePath) throw new Error("An isolated fixture database is required");
const library = await openTestLibrary(databasePath);
await library.jobs.recoverAfterExclusiveStartup();
const vector = () => {
  const values = new Float32Array(768);
  values[0] = 1;
  return values;
};
const ai = createAiJobProcessors({
  modelCacheDirectory: `${databasePath}.models`,
  ocr: { recognize: async () => "Restart invoice A314" },
  searchModels: {
    embedImage: async () => vector(),
    embedQuery: async () => vector(),
    embedText: async () => {
      const processing = library.db
        .prepare(
          "SELECT id, item_id, kind, worker_id, lease_until FROM jobs WHERE status = 'processing'",
        )
        .all();
      const cachedImages = library.db
        .prepare("SELECT item_id FROM search_vectors WHERE kind = 'image'")
        .all();
      process.stdout.write(JSON.stringify({ processing, cachedImages }) + "\n");
      return new Promise<Float32Array>(() => {});
    },
    caption: async () => "A cat beside a ball.",
    close: async () => {},
  },
});
const worker = await library.worker({ processors: ai.processors });
await worker.start();
setInterval(() => {}, 1000);
