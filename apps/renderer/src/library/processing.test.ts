import type { Job } from "@inkling/contracts";
import { describe, expect, it } from "bun:test";
import { summarizeJobs, withJobs } from "./processing.ts";

const job = (fields: Partial<Job> & Pick<Job, "id" | "kind" | "status" | "createdAt">): Job => ({
  itemId: "item",
  retryCount: 0,
  maxRetries: 3,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  progressCurrent: 0,
  progressTotal: null,
  progressMessage: null,
  ...fields,
});

describe("job summaries", () => {
  it("hides a failure that a newer job of the same kind replaced", () => {
    const summary = summarizeJobs([
      job({ id: "1", kind: "ocr", status: "failed", createdAt: 1, errorMessage: "broken" }),
      job({ id: "2", kind: "ocr", status: "completed", createdAt: 2 }),
    ]);
    expect(summary).toBeNull();
  });

  it("reports what is running and the newest failure of another kind", () => {
    const summary = summarizeJobs([
      job({ id: "1", kind: "thumbnail", status: "failed", createdAt: 1, errorMessage: "broken" }),
      job({
        id: "2",
        kind: "ocr",
        status: "processing",
        createdAt: 2,
        progressCurrent: 1,
        progressTotal: 3,
        progressMessage: "Reading page 1",
      }),
    ]);
    expect(summary).toEqual({
      active: true,
      message: "Reading page 1",
      progressCurrent: 1,
      progressTotal: 3,
      failedJob: { id: "1", message: "broken" },
    });
  });

  it("keeps an unchanged summary's object so its card does not re-render", () => {
    const running = [job({ id: "1", kind: "ocr", status: "pending", createdAt: 1, itemId: "a" })];
    const first = withJobs(new Map(), ["a"], running);
    expect(withJobs(first, ["a"], running)).toBe(first);
    expect(withJobs(first, ["a"], []).has("a")).toBe(false);
  });
});
