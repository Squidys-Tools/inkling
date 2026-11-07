import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { createUrlExtractor, extractUrlOnThread } from "./extract-url.ts";

const threadUrl = new URL("./extract-url-thread.ts", import.meta.url);

test("a failure on the thread reaches the caller with its own message", async () => {
  await expect(extractUrlOnThread("not a url")).rejects.toThrow(/url/i);
}, 20_000);

test("pages in a row share a thread, which ends once idle", async () => {
  const threads: Worker[] = [];
  const extract = createUrlExtractor({
    idleMillis: 200,
    startThread: () => {
      const thread = new Worker(threadUrl);
      threads.push(thread);
      return thread;
    },
  });
  for (let page = 0; page < 3; page++) await expect(extract("not a url")).rejects.toThrow(/url/i);
  expect(threads).toHaveLength(1);
  const { promise: ended, resolve } = Promise.withResolvers<void>();
  threads[0].once("exit", () => resolve());
  await ended;
  await expect(extract("not a url")).rejects.toThrow(/url/i);
  expect(threads).toHaveLength(2);
  await threads[1].terminate();
}, 30_000);

test("pages at once get a thread each, one stays, and a timed-out thread is never reused", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inkling-extract-url-"));
  try {
    const script = join(directory, "thread.mjs");
    writeFileSync(
      script,
      `import { parentPort } from "node:worker_threads";
       parentPort.on("message", (url) => {
         if (url !== "hang") parentPort.postMessage({ error: "no article", permanent: false });
       });`,
    );
    const threads: Worker[] = [];
    const exits: Promise<unknown>[] = [];
    const extract = createUrlExtractor({
      startThread: () => {
        const thread = new Worker(script);
        threads.push(thread);
        exits.push(new Promise((resolve) => thread.once("exit", resolve)));
        return thread;
      },
    });
    const pages = await Promise.allSettled([1, 2, 3].map(() => extract("page")));
    expect(pages.map(({ status }) => status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(threads).toHaveLength(3);
    await Promise.race(exits);
    await expect(extract("hang", 50)).rejects.toThrow("too long");
    await expect(extract("page")).rejects.toThrow("no article");
    expect(threads).toHaveLength(4);
    await Promise.all(threads.map((thread) => thread.terminate()));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);

test("a kept thread that throws between pages harms nothing and is not reused", async () => {
  const directory = mkdtempSync(join(tmpdir(), "inkling-extract-url-"));
  try {
    const script = join(directory, "thread.mjs");
    writeFileSync(
      script,
      `import { parentPort } from "node:worker_threads";
       parentPort.on("message", () => {
         parentPort.postMessage({ error: "no article", permanent: false });
         setTimeout(() => { throw new Error("late socket error"); }, 20);
       });`,
    );
    const threads: Worker[] = [];
    const extract = createUrlExtractor({
      startThread: () => {
        const thread = new Worker(script);
        threads.push(thread);
        return thread;
      },
    });
    const { promise: ended, resolve } = Promise.withResolvers<void>();
    const first = extract("page");
    threads[0].once("exit", () => resolve());
    await expect(first).rejects.toThrow("no article");
    await ended;
    const second = extract("page");
    expect(threads).toHaveLength(2);
    await expect(second).rejects.toThrow("no article");
    await threads[1].terminate();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);

test("an error a thread queued before it was stopped harms nothing", async () => {
  // Node emits a thread's queued error while it exits, after the extractor has stopped listening
  // for that page; emitting it from terminate() makes that order certain.
  class LateErrorWorker extends Worker {
    override terminate() {
      this.emit("error", new Error("late socket error"));
      return super.terminate();
    }
  }
  const directory = mkdtempSync(join(tmpdir(), "inkling-extract-url-"));
  try {
    const script = join(directory, "thread.mjs");
    writeFileSync(
      script,
      `import { parentPort } from "node:worker_threads";
       parentPort.on("message", () => parentPort.postMessage({ error: "no article", permanent: false }));`,
    );
    const exits: Promise<unknown>[] = [];
    const extract = createUrlExtractor({
      idleMillis: 50,
      startThread: () => {
        const thread = new LateErrorWorker(script);
        exits.push(new Promise((resolve) => thread.once("exit", resolve)));
        return thread;
      },
    });
    // The second reply finds a thread already kept and stops its own; the kept one stops idle.
    const pages = await Promise.allSettled([extract("page"), extract("page")]);
    expect(pages.map(({ status }) => status)).toEqual(["rejected", "rejected"]);
    expect(exits).toHaveLength(2);
    await Promise.all(exits);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
