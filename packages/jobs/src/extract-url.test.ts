import { expect, test } from "bun:test";
import { extractUrlOnThread } from "./extract-url.ts";

test("a failure on the thread reaches the caller with its own message", async () => {
  await expect(extractUrlOnThread("not a url")).rejects.toThrow(/url/i);
}, 20_000);

test("a thread past its time is stopped and fails the job", async () => {
  await expect(extractUrlOnThread("https://example.invalid/", 1)).rejects.toThrow("too long");
}, 20_000);
