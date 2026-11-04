import { expect, test } from "bun:test";
import type { GitHub } from "./github.ts";
import { deploymentUrl, upsertComment, vercel } from "./site-deploy.ts";

test("finds the deployment URL after CLI warnings", () => {
  const output =
    "WARN! Build not running on Vercel\nhttps://vercel.com/docs\nhttps://inkling-abc12.vercel.app\n";
  expect(deploymentUrl(output)).toBe("https://inkling-abc12.vercel.app");
});

test.each([
  ["no URL", "Error: deployment failed\n"],
  ["two URLs", "https://a.vercel.app\nhttps://b.vercel.app\n"],
  ["a URL with a path", "https://a.vercel.app/inspect\n"],
])("refuses output with %s", (_name, output) => {
  expect(() => deploymentUrl(output)).toThrow(/Expected one deployment URL/);
});

function github(comments: object[]) {
  const sent: unknown[] = [];
  const api: GitHub = {
    get: async () => {
      throw new Error("unused");
    },
    list: async <T>() => comments as T[],
    send: async (method, path, body) => void sent.push([method, path, body]),
  };
  return { api, sent };
}

test("updates the comment that carries the marker", async () => {
  const { api, sent } = github([
    { id: 1, body: "other" },
    { id: 2, body: "<!-- m -->\nold" },
  ]);
  await upsertComment(api, 9, "<!-- m -->", "new");
  expect(sent).toEqual([
    ["PATCH", "repos/{owner}/{repo}/issues/comments/2", { body: "<!-- m -->\nnew" }],
  ]);
});

test("creates the comment when none carries the marker", async () => {
  const { api, sent } = github([{ id: 1, body: "other" }, { id: 3 }]);
  await upsertComment(api, 9, "<!-- m -->", "new");
  expect(sent).toEqual([
    ["POST", "repos/{owner}/{repo}/issues/9/comments", { body: "<!-- m -->\nnew" }],
  ]);
});

test("a Vercel call answered with an empty body succeeds", async () => {
  process.env.VERCEL_ORG_ID = "team";
  process.env.VERCEL_TOKEN = "token";
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    expect(await vercel("POST", "/v10/projects/p/promote/d")).toBeUndefined();
    expect(calls).toEqual(["https://api.vercel.com/v10/projects/p/promote/d?teamId=team"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});
