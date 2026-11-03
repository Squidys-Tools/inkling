import { expect, test } from "bun:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { shouldReleaseNightly } = require("../../.github/scripts/nightly-release.cjs");

const context = { repo: { owner: "o", repo: "r" }, sha: "candidate" };
const core = { info() {} };

function github(releases, comparisonStatus) {
  return {
    paginate: async () => releases,
    rest: {
      repos: {
        listReleases: () => {},
        compareCommitsWithBasehead: async () => ({ data: { status: comparisonStatus } }),
      },
    },
  };
}

const nightly = (published_at) => ({
  tag_name: "v0.1.1-nightly.20261103.14",
  draft: false,
  published_at,
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
    "the 13:00 slot opens after a 05:00 nightly",
    "2026-11-04T13:08:00Z",
    [nightly("2026-11-04T05:12:00Z")],
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
])("%s", async (_name, now, releases, comparisonStatus, expected) => {
  const result = await shouldReleaseNightly({
    github: github(releases, comparisonStatus),
    context,
    core,
    now: Date.parse(now),
  });
  expect(result).toBe(expected);
});
