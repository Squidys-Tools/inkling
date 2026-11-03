import { describe, expect, it } from "bun:test";
import { loadingPhase, startsReveal } from "./cardLoading.ts";
import type { Processing } from "../library/jobs.ts";

const running: Processing = {
  active: true,
  message: null,
  progressCurrent: 0,
  progressTotal: null,
  failedJob: null,
};
const failed: Processing = { ...running, active: false, failedJob: { id: "j", message: "no" } };

describe("loadingPhase", () => {
  it("waits on the thumbnail before it processes", () => {
    expect(loadingPhase({ treatment: "article", image: undefined }, running)).toBe("captured");
    expect(loadingPhase({ treatment: "article", image: "a.png" }, running)).toBe("processing");
  });

  it("shows a failure only once nothing is still running", () => {
    expect(loadingPhase({ treatment: "pdf", image: "a.png" }, failed)).toBe("failed");
    expect(loadingPhase({ treatment: "pdf", image: "a.png" }, { ...failed, active: true })).toBe(
      "processing",
    );
  });

  it("leaves notes, quotes and idle cards alone", () => {
    expect(loadingPhase({ treatment: "note", image: undefined }, running)).toBeNull();
    expect(loadingPhase({ treatment: "quote", image: undefined }, failed)).toBeNull();
    expect(loadingPhase({ treatment: "media", image: "a.png" }, undefined)).toBeNull();
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
