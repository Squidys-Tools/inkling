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

const { assetUrl, importLibrary, listSpaces, selectLibraryDirectory, summariesFromJobs } =
  await import("./libraryApi");

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
