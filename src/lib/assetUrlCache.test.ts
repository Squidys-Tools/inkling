import { expect, test } from "bun:test";
import { createAssetUrlResolver } from "./assetUrlCache";

test("reuses in-flight and resolved paths without mixing assets", async () => {
  const calls: string[] = [];
  const resolve = createAssetUrlResolver(async (path) => {
    calls.push(path);
    return `asset:${path}`;
  });
  const first = resolve("assets/first.webp");
  expect(resolve("assets/first.webp")).toBe(first);
  expect(await first).toBe("asset:assets/first.webp");
  expect(await resolve("assets/first.webp")).toBe("asset:assets/first.webp");
  expect(await resolve("assets/second.webp")).toBe("asset:assets/second.webp");
  expect(calls).toEqual(["assets/first.webp", "assets/second.webp"]);
});

test("failed paths can be retried", async () => {
  let attempts = 0;
  const resolve = createAssetUrlResolver(async () => {
    if (++attempts === 1) throw new Error("temporarily unavailable");
    return "asset:ready";
  });
  await expect(resolve("assets/item")).rejects.toThrow("temporarily unavailable");
  expect(await resolve("assets/item")).toBe("asset:ready");
  expect(attempts).toBe(2);
});

test("evicts old entries at the size limit", async () => {
  let calls = 0;
  const resolve = createAssetUrlResolver(async (path) => {
    calls++;
    return path;
  });
  for (let index = 0; index <= 4096; index++) await resolve(String(index));
  await resolve("4096");
  expect(calls).toBe(4097);
  await resolve("0");
  expect(calls).toBe(4098);
});

test("recently used entries survive bulk inserts", async () => {
  const calls: string[] = [];
  const resolve = createAssetUrlResolver(async (path) => {
    calls.push(path);
    return path;
  }, 4);
  await resolve("hot");
  await resolve("a");
  await resolve("b");
  await resolve("hot");
  await resolve("c");
  await resolve("d");
  const before = calls.length;
  expect(await resolve("hot")).toBe("hot");
  expect(calls.length).toBe(before);
  await resolve("a");
  expect(calls.filter((path) => path === "hot")).toHaveLength(1);
  expect(calls.filter((path) => path === "a")).toHaveLength(2);
});
