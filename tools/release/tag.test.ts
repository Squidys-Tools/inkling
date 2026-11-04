import { expect, test } from "bun:test";
import type { GitHub } from "../ci/github.ts";
import { ensureReleaseTag } from "./tag.ts";

function github(refs: object[], annotated?: string) {
  const sent: unknown[] = [];
  const api: GitHub = {
    get: async <T>(path: string) =>
      (path.includes("/git/tags/") ? { object: { sha: annotated, type: "commit" } } : refs) as T,
    list: async () => [],
    send: async (method, path, body) => void sent.push([method, path, body]),
  };
  return { api, sent };
}

const ref = (name: string, sha: string, type = "commit") => ({
  ref: `refs/tags/${name}`,
  object: { sha, type },
});

test("creates the tag when only a longer tag shares its prefix", async () => {
  const { api, sent } = github([ref("v0.1.10", "other")]);
  expect(await ensureReleaseTag(api, "v0.1.1", "release")).toBe("created");
  expect(sent).toEqual([
    ["POST", "repos/{owner}/{repo}/git/refs", { ref: "refs/tags/v0.1.1", sha: "release" }],
  ]);
});

test("reuses a tag an earlier attempt made, annotated or not", async () => {
  expect(await ensureReleaseTag(github([ref("v0.1.1", "release")]).api, "v0.1.1", "release")).toBe(
    "already existed",
  );
  const annotated = github([ref("v0.1.1", "tag-object", "tag")], "release");
  expect(await ensureReleaseTag(annotated.api, "v0.1.1", "release")).toBe("already existed");
  expect(annotated.sent).toEqual([]);
});

test("refuses a tag that points at another commit", async () => {
  const { api, sent } = github([ref("v0.1.1", "other")]);
  await expect(ensureReleaseTag(api, "v0.1.1", "release")).rejects.toThrow(/points at other/);
  expect(sent).toEqual([]);
});
