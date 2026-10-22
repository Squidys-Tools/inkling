import { expect, test } from "bun:test";
import type { ProcessingJob } from "./libraryApi";

const invokeCalls: { command: string; args?: Record<string, unknown> }[] = [];

const commands = new Proxy(
  {} as Record<string, (args?: Record<string, unknown>) => Promise<unknown>>,
  {
    get: (_target, property) => {
      if (typeof property !== "string") return undefined;
      return async (args?: Record<string, unknown>) => {
        invokeCalls.push({ command: property, args });
        if (property === "initialize_storage") {
          return { databasePath: "library.sqlite3", fts5Enabled: true, schemaVersion: 1 };
        }
        if (property === "list_spaces") return [];
        if (property === "list_item_spaces") return ["space-1"];
        if (property === "add_space_item" || property === "remove_space_item") return null;
        if (property === "get_item")
          return {
            id: args?.id,
            kind: "url",
            title: "Stored article",
            description: "Article summary",
            body: "",
            bodyFormat: "md",
            sourceUrl: "https://example.com/article",
            sourceLabel: "example.com",
            localAssetPath: null,
            thumbnailPath: null,
            ocrText: "",
            metadata: { html: "<p>Saved article content</p>" },
            createdAt: 1,
            updatedAt: 1,
            archived: false,
          };
        if (property === "get_jobs_for_items") return [];
        if (property === "count_active_jobs") return 2;
        if (property === "enqueue_ocr_job") return "job-2";
        if (property === "check_for_updates") return { version: "0.2.0" };
        if (property === "install_update") return null;
        if (property === "select_library_directory") return `/scratch/${args?.title}`;
        if (property === "import_library") {
          return {
            importedItems: 1,
            skippedDuplicateItems: 0,
            importedSpaces: 0,
            skippedDuplicateSpaces: 0,
            assetFiles: 0,
            unverifiedAssetFiles: 0,
          };
        }
        throw new Error(`Unexpected command: ${property}`);
      };
    },
  },
);

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { inkling: { commands } },
});

const {
  addSpaceItem,
  assetUrl,
  checkForUpdates,
  countActiveJobs,
  enqueueOcrJob,
  getItem,
  getProcessingSummaries,
  importLibrary,
  installUpdate,
  listItemSpaces,
  listSpaces,
  removeSpaceItem,
  selectLibraryDirectory,
  summariesFromJobs,
} = await import("./libraryApi");

function job(overrides: Partial<ProcessingJob>): ProcessingJob {
  return {
    id: "job-1",
    itemId: "item-1",
    kind: "ocr_image",
    status: "completed",
    retryCount: 0,
    maxRetries: 3,
    errorMessage: null,
    createdAt: 1,
    startedAt: null,
    completedAt: null,
    progressCurrent: 0,
    progressTotal: null,
    progressMessage: null,
    ...overrides,
  };
}

test("groups jobs by item and summarizes each", () => {
  const summaries = summariesFromJobs(
    ["a", "b"],
    [
      job({ id: "1", itemId: "a", kind: "generate_embedding", status: "completed" }),
      job({
        id: "2",
        itemId: "a",
        kind: "ocr_image",
        status: "processing",
        progressCurrent: 2,
        progressTotal: 4,
        progressMessage: "OCR",
      }),
      job({ id: "3", itemId: "b", status: "failed", errorMessage: "boom" }),
    ],
  );
  const a = summaries.get("a");
  expect(a?.active).toBe(true);
  expect(a?.progressCurrent).toBe(2);
  expect(a?.progressTotal).toBe(4);
  expect(a?.message).toBe("OCR");
  expect(a?.hasOcrJob).toBe(true);
  expect(a?.completed).toBe(1);
  const b = summaries.get("b");
  expect(b?.active).toBe(false);
  expect(b?.failedJob?.errorMessage).toBe("boom");
  expect(b?.hasOcrJob).toBe(true);
});

test("items without jobs get a quiet default summary", () => {
  const summaries = summariesFromJobs(["missing"], []);
  const summary = summaries.get("missing");
  expect(summary?.active).toBe(false);
  expect(summary?.total).toBe(0);
  expect(summary?.hasOcrJob).toBe(false);
  expect(summary?.failedJob).toBe(null);
});

test("Electron resolves managed assets through app protocol and uses its native folder picker", async () => {
  const originalWindow = globalThis.window;
  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        inkling: {
          commands: {
            select_library_directory: async ({ title }: { title: string }) => `/scratch/${title}`,
          },
        },
      },
    });

    expect(await assetUrl("assets/items/abc/my image.png")).toBe(
      "app://local/library-assets/items/abc/my%20image.png",
    );
    expect(await assetUrl("assets/items/../outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items//outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items/./outside.png")).toBeUndefined();
    expect(await assetUrl("assets/items/abc:outside.png")).toBeUndefined();
    expect(await selectLibraryDirectory("Exports")).toBe("/scratch/Exports");
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

test("processing summaries distinguish OCR jobs from embedding jobs", () => {
  const summaries = summariesFromJobs(
    ["image"],
    [job({ itemId: "image", kind: "generate_embedding", status: "completed" })],
  );
  expect(summaries.get("image")?.hasOcrJob).toBe(false);
});

test("the newest failed job surfaces for its item", () => {
  const summaries = summariesFromJobs(
    ["a"],
    [
      job({
        id: "1",
        itemId: "a",
        kind: "generate_embedding",
        status: "failed",
        errorMessage: "older failure",
        createdAt: 1,
      }),
      job({
        id: "2",
        itemId: "a",
        kind: "generate_embedding",
        status: "failed",
        errorMessage: "newest failure",
        createdAt: 2,
      }),
    ],
  );
  expect(summaries.get("a")?.failedJob?.errorMessage).toBe("newest failure");
});

test("Space reads and export restores wait for storage initialization", async () => {
  invokeCalls.length = 0;

  await Promise.all([listSpaces(), importLibrary("export-folder")]);

  expect(invokeCalls[0]?.command).toBe("initialize_storage");
  expect(
    invokeCalls
      .slice(1)
      .map((call) => call.command)
      .sort(),
  ).toEqual(["import_library", "list_spaces"]);
  expect(invokeCalls.find((call) => call.command === "import_library")?.args).toEqual({
    exportDirectory: "export-folder",
  });
});

test("filing an item in and out of a Space sends the space and item ids", async () => {
  invokeCalls.length = 0;

  await addSpaceItem("space-1", "item-7");
  await removeSpaceItem("space-1", "item-7");

  expect(invokeCalls.map((call) => call.command)).toEqual(["add_space_item", "remove_space_item"]);
  expect(invokeCalls[0]?.args).toEqual({ spaceId: "space-1", itemId: "item-7" });
  expect(invokeCalls[1]?.args).toEqual({ spaceId: "space-1", itemId: "item-7" });
});

test("reading an item's Spaces returns the ids the overlay renders from", async () => {
  invokeCalls.length = 0;

  expect(await listItemSpaces("item-7")).toEqual(["space-1"]);
  expect(invokeCalls.map((call) => call.command)).toEqual(["list_item_spaces"]);
  expect(invokeCalls[0]?.args).toEqual({ itemId: "item-7" });
});

test("the UI can read the library-wide active job count", async () => {
  invokeCalls.length = 0;

  expect(await countActiveJobs()).toBe(2);
  expect(invokeCalls[invokeCalls.length - 1]?.command).toBe("count_active_jobs");
});

test("the UI can hydrate job state for an item before deciding to enqueue OCR", async () => {
  invokeCalls.length = 0;

  const summaries = await getProcessingSummaries(["item-7"]);

  expect(summaries.get("item-7")?.hasOcrJob).toBe(false);
  expect(invokeCalls[invokeCalls.length - 1]).toEqual({
    command: "get_jobs_for_items",
    args: { itemIds: ["item-7"] },
  });
});

test("the UI can enqueue OCR for a selected image or PDF", async () => {
  invokeCalls.length = 0;

  expect(await enqueueOcrJob("item-7")).toBe("job-2");
  expect(invokeCalls[invokeCalls.length - 1]).toEqual({
    command: "enqueue_ocr_job",
    args: { itemId: "item-7" },
  });
});

test("the UI loads the full stored item by id when a reader opens", async () => {
  invokeCalls.length = 0;

  const item = await getItem("article-1");

  expect(item?.metadata.html).toBe("<p>Saved article content</p>");
  expect(invokeCalls).toEqual([{ command: "get_item", args: { id: "article-1" } }]);
});

test("the UI checks for updates and installs only after an explicit request", async () => {
  invokeCalls.length = 0;

  expect(await checkForUpdates()).toEqual({ version: "0.2.0" });
  await installUpdate("0.2.0");

  expect(invokeCalls).toEqual([
    { command: "check_for_updates" },
    { command: "install_update", args: { expectedVersion: "0.2.0" } },
  ]);
});

test("Electron asset paths use the storage-backed app URL mapping", async () => {
  const electronWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { inkling: { commands: {} } },
  });

  try {
    invokeCalls.length = 0;
    expect(await assetUrl("assets/item.png")).toBe("app://local/library-assets/item.png");
    expect(invokeCalls).toEqual([]);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: electronWindow });
  }
});
