import { expect, mock, test } from "bun:test";
import type { ProcessingJob } from "./libraryApi";

const invokeCalls: string[] = [];

mock.module("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => path,
  invoke: async (command: string) => {
    invokeCalls.push(command);
    if (command === "initialize_storage") {
      return { databasePath: "library.sqlite3", fts5Enabled: true, schemaVersion: 1 };
    }
    if (command === "list_spaces") return [];
    throw new Error(`Unexpected command: ${command}`);
  },
}));

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { __TAURI_INTERNALS__: {} },
});

const { listSpaces, summariesFromJobs } = await import("./libraryApi");

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
  expect(a?.completed).toBe(1);
  const b = summaries.get("b");
  expect(b?.active).toBe(false);
  expect(b?.failedJob?.errorMessage).toBe("boom");
});

test("items without jobs get a quiet default summary", () => {
  const summaries = summariesFromJobs(["missing"], []);
  const summary = summaries.get("missing");
  expect(summary?.active).toBe(false);
  expect(summary?.total).toBe(0);
  expect(summary?.failedJob).toBe(null);
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

  expect(invokeCalls).toEqual(["initialize_storage", "list_spaces"]);
});
