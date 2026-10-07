import { expect, mock, test } from "bun:test";
import type { ProcessingJob } from "./libraryApi";

const invokeCalls: { command: string; args?: Record<string, unknown> }[] = [];

mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: async (command: string, args?: Record<string, unknown>) => {
    invokeCalls.push({ command, args });
    if (command === "initialize_storage") {
      return { databasePath: "library.sqlite3", fts5Enabled: true, schemaVersion: 1 };
    }
    if (command === "list_spaces") return [];
    if (command === "list_item_spaces") return ["space-1"];
    if (command === "add_space_item" || command === "remove_space_item") return null;
    if (command === "count_active_jobs") return 2;
    if (command === "enqueue_ocr_job") return "job-2";
    throw new Error(`Unexpected command: ${command}`);
  },
}));

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { __TAURI_INTERNALS__: {} },
});

const {
  addSpaceItem,
  countActiveJobs,
  enqueueOcrJob,
  listItemSpaces,
  listSpaces,
  removeSpaceItem,
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
      job({ id: "2", itemId: "a", kind: "ocr_image", status: "processing", progressCurrent: 2, progressTotal: 4, progressMessage: "OCR" }),
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
      job({ id: "1", itemId: "a", kind: "generate_embedding", status: "failed", errorMessage: "older failure", createdAt: 1 }),
      job({ id: "2", itemId: "a", kind: "generate_embedding", status: "failed", errorMessage: "newest failure", createdAt: 2 }),
    ],
  );
  expect(summaries.get("a")?.failedJob?.errorMessage).toBe("newest failure");
});

test("listing Spaces initializes storage before reading persisted Spaces", async () => {
  invokeCalls.length = 0;

  await listSpaces();

  expect(invokeCalls.map((call) => call.command)).toEqual(["initialize_storage", "list_spaces"]);
});

test("filing an item in and out of a Space sends the space and item ids", async () => {
  invokeCalls.length = 0;

  await addSpaceItem("space-1", "item-7");
  await removeSpaceItem("space-1", "item-7");

  expect(invokeCalls.map((call) => call.command)).toEqual([
    "add_space_item",
    "remove_space_item",
  ]);
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

test("the UI can enqueue OCR for a selected image or PDF", async () => {
  invokeCalls.length = 0;

  expect(await enqueueOcrJob("item-7")).toBe("job-2");
  expect(invokeCalls[invokeCalls.length - 1]).toEqual({ command: "enqueue_ocr_job", args: { itemId: "item-7" } });
});
