import { describe, expect, it } from "bun:test";
import { loadingPhase, startsReveal } from "./cardLoading.ts";
import type { Processing } from "../library/jobs.ts";
import { summarizeJobs } from "../library/processing.ts";

const summary = (...states: [string, "pending" | "processing" | "failed" | "completed"][]) =>
  summarizeJobs(
    states.map(([kind, status], index) => ({
      id: `j${index}`,
      itemId: "item",
      kind,
      status,
      createdAt: 1000,
      startedAt: null,
      completedAt: null,
      retryCount: 0,
      maxRetries: 3,
      errorMessage: "no",
      progressCurrent: 0,
      progressTotal: null,
      progressMessage: null,
    })),
  )!;

const running: Processing = {
  active: true,
  backgroundOnly: false,
  message: null,
  progressCurrent: 0,
  progressTotal: null,
  failedJob: null,
  startedAt: 1000,
};
const failed: Processing = { ...running, active: false, failedJob: { id: "j", message: "no" } };

describe("loadingPhase", () => {
  it("waits on the thumbnail before it processes", () => {
    expect(loadingPhase({ treatment: "article", image: undefined, createdAt: 1000 }, running)).toBe(
      "captured",
    );
    expect(loadingPhase({ treatment: "article", image: "a.png", createdAt: 1000 }, running)).toBe(
      "processing",
    );
    for (const status of ["pending", "processing"] as const) {
      const embedding = summary(["generate_embedding", status], ["enrich_url", "completed"]);
      expect(embedding.active).toBe(true);
      for (const image of [undefined, "a.png"]) {
        expect(
          loadingPhase({ treatment: "article", image, createdAt: 1000 }, embedding),
        ).toBeNull();
      }
      expect(
        loadingPhase(
          { treatment: "article", image: "a.png", createdAt: 1000 },
          summary(["generate_embedding", status], ["enrich_url", "pending"]),
        ),
      ).toBe("processing");
    }
  });

  it("shows a failure only once nothing is still running", () => {
    expect(loadingPhase({ treatment: "pdf", image: "a.png", createdAt: 1000 }, failed)).toBe(
      "failed",
    );
    expect(
      loadingPhase(
        { treatment: "pdf", image: "a.png", createdAt: 1000 },
        { ...failed, active: true },
      ),
    ).toBe("processing");
    const embedding = summary(["generate_embedding", "failed"]);
    expect(embedding.failedJob).toEqual({ id: "j0", message: "no" });
    expect(
      loadingPhase({ treatment: "article", image: "a.png", createdAt: 1000 }, embedding),
    ).toBeNull();
    expect(
      loadingPhase(
        { treatment: "article", image: "a.png", createdAt: 1000 },
        summary(["generate_embedding", "failed"], ["enrich_url", "failed"]),
      ),
    ).toBe("failed");
  });

  it("keeps a failed picture whole, with the corner badge", () => {
    expect(
      loadingPhase({ treatment: "media", image: "a.png", createdAt: 1000 }, failed),
    ).toBeNull();
  });

  it("leaves work queued long after the capture, like a re-index, to the corner badge", () => {
    const later = { ...running, startedAt: 1000 + 11 * 60 * 1000 };
    expect(loadingPhase({ treatment: "media", image: "a.png", createdAt: 1000 }, later)).toBeNull();
    expect(
      loadingPhase(
        { treatment: "media", image: "a.png", createdAt: 1000 },
        {
          ...failed,
          startedAt: later.startedAt,
        },
      ),
    ).toBeNull();
  });

  it("leaves notes, quotes and idle cards alone", () => {
    expect(
      loadingPhase({ treatment: "note", image: undefined, createdAt: 1000 }, running),
    ).toBeNull();
    expect(
      loadingPhase({ treatment: "quote", image: undefined, createdAt: 1000 }, failed),
    ).toBeNull();
    expect(
      loadingPhase({ treatment: "media", image: "a.png", createdAt: 1000 }, undefined),
    ).toBeNull();
  });
});

describe("startsReveal", () => {
  it("fires when running jobs finish with a thumbnail, not after a failure or retry", () => {
    expect(startsReveal("processing", null, "a.png")).toBe(true);
    expect(startsReveal("captured", null, "a.png")).toBe(true);
    expect(startsReveal("captured", null, undefined)).toBe(false);
    expect(startsReveal("failed", null, "a.png")).toBe(false);
    expect(startsReveal("processing", "failed", "a.png")).toBe(false);
  });
});
