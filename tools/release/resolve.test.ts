import { expect, test } from "bun:test";
import type { GitHub } from "../ci/github.ts";
import { resolveRelease, type Trigger } from "./resolve.ts";

const nightly = (published_at: string, tag_name = "v0.1.1-nightly.20261103.14") => ({
  tag_name,
  draft: false,
  published_at,
});

function github(releases: object[], statuses: Record<string, string> = {}): GitHub {
  return {
    list: async <T>() => releases as T[],
    get: async <T>(path: string) => {
      const compare = /compare\/(.+)\?/.exec(path);
      if (compare) return { status: statuses[compare[1]!] ?? "ahead" } as T;
      if (path.endsWith("/commits/v0.1.1-nightly.20261103.14")) return { sha: "nightly-sha" } as T;
      throw new Error(`unexpected ${path}`);
    },
    send: async () => {},
  };
}

const trigger = (overrides: Partial<Trigger>): Trigger => ({
  event: "schedule",
  ref: "refs/heads/main",
  sha: "candidate",
  defaultBranch: "main",
  ...overrides,
});

// Slots open at 05:00, 13:00 and 21:00 UTC: midnight, 8am and 4pm EST.
test.each([
  ["no nightly published yet", "2026-11-04T05:08:00Z", [], "ahead", true],
  [
    "a late tick in a slot that already shipped",
    "2026-11-04T05:38:00Z",
    [nightly("2026-11-04T05:12:00Z")],
    "ahead",
    false,
  ],
  [
    "the 21:00 slot is still current at 04:59 and already shipped",
    "2026-11-04T04:59:00Z",
    [nightly("2026-11-03T21:10:00Z")],
    "ahead",
    false,
  ],
  [
    "the 05:00 slot opens after a 21:00 nightly",
    "2026-11-04T05:08:00Z",
    [nightly("2026-11-03T21:10:00Z")],
    "ahead",
    true,
  ],
  [
    "a new slot with no new commits",
    "2026-11-04T13:08:00Z",
    [nightly("2026-11-04T05:12:00Z")],
    "identical",
    false,
  ],
  [
    "a candidate behind the last nightly",
    "2026-11-04T13:08:00Z",
    [nightly("2026-11-04T05:12:00Z")],
    "behind",
    false,
  ],
  [
    "a draft or stable release does not count as the last nightly",
    "2026-11-04T13:08:00Z",
    [
      nightly("2026-11-04T05:12:00Z"),
      { ...nightly("2026-11-04T13:01:00Z", "v0.1.2-nightly.20261104.3"), draft: true },
      { tag_name: "v0.1.1", draft: false, published_at: "2026-11-04T13:02:00Z" },
    ],
    "ahead",
    true,
  ],
])("schedule: %s", async (_name, now, releases, status, due) => {
  const api = github(releases, { "v0.1.1-nightly.20261103.14...candidate": status });
  const result = await resolveRelease(api, trigger({}), Date.parse(now));
  expect(result).toEqual({ channel: "nightly", ref: "candidate", due, nightlyVersion: "" });
});

test("a dispatched stable builds the latest nightly's commit at its previewed version", async () => {
  const api = github([nightly("2026-11-03T21:10:00Z")]);
  const result = await resolveRelease(
    api,
    trigger({ event: "workflow_dispatch", dispatchChannel: "stable" }),
  );
  expect(result).toEqual({
    channel: "stable",
    ref: "nightly-sha",
    due: true,
    nightlyVersion: "0.1.1",
  });
});

test("a tag push builds the tagged commit", async () => {
  const result = await resolveRelease(
    github([]),
    trigger({ event: "push", ref: "refs/tags/v0.2.0" }),
  );
  expect(result).toEqual({ channel: "stable", ref: "candidate", due: true, nightlyVersion: "" });
});

test("a preview builds any branch without checking it", async () => {
  const api = github([], { "candidate...main": "diverged" });
  const result = await resolveRelease(
    api,
    trigger({ event: "workflow_dispatch", ref: "refs/heads/topic" }),
  );
  expect(result.channel).toBe("preview");
});

test.each([
  [
    "a nightly dispatched from a branch",
    { dispatchChannel: "nightly", ref: "refs/heads/topic" },
    {},
    /must be dispatched from main/,
  ],
  [
    "a tag on a commit main does not contain",
    { event: "push", ref: "refs/tags/v0.2.0" },
    { "candidate...main": "diverged" },
    /not contained in main/,
  ],
  ["an unknown channel", { dispatchChannel: "beta" }, {}, /Unsupported release channel/],
])("refuses %s", async (_name, overrides, statuses, error) => {
  const api = github([], statuses);
  const run = resolveRelease(api, trigger({ event: "workflow_dispatch", ...overrides }));
  await expect(run).rejects.toThrow(error);
});

test("a stable dispatch with no published nightly fails", async () => {
  const api = github([]);
  const run = resolveRelease(
    api,
    trigger({ event: "workflow_dispatch", dispatchChannel: "stable" }),
  );
  await expect(run).rejects.toThrow(/No published nightly/);
});
