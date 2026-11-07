import type { NormalizedArticle } from "@inkling/ingestion/types";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

export type ExtractUrlReply =
  | { article: NormalizedArticle }
  | { error: string; permanent: boolean };

// Source runs as .ts under Bun and as bundled .mjs in the app; the thread sits beside it either way.
const threadUrl = new URL(
  `./extract-url-thread${extname(fileURLToPath(import.meta.url))}`,
  import.meta.url,
);

// Under the job's two minutes, so a page that never finishes parsing costs a retry, not a thread.
const extractionMillis = 100_000;
// Starting a thread takes about 0.6 s, so a run of saves shares one; its memory goes when it ends.
const threadIdleMillis = 30_000;

/**
 * Parsing a large page holds its thread for up to 40 s, and on the worker's own thread that stops
 * every download, thumbnail and reply. A thread reads one page at a time and at most one is kept.
 */
export function createUrlExtractor({
  idleMillis = threadIdleMillis,
  startThread = () => new Worker(threadUrl),
}: { idleMillis?: number; startThread?: () => Worker } = {}) {
  let kept: { thread: Worker; timer: ReturnType<typeof setTimeout> } | undefined;

  const forget = (thread: Worker) => {
    if (kept?.thread !== thread) return;
    clearTimeout(kept.timer);
    kept = undefined;
  };

  const start = () => {
    const thread = startThread();
    // Node can deliver a thread's error after its reply, even while terminating it. Without a
    // listener for the thread's whole life, that error would throw in the process running every
    // job. A thread that dies between pages must not be handed the next one either.
    thread.on("error", () => forget(thread));
    thread.once("exit", () => forget(thread));
    return thread;
  };

  const keep = (thread: Worker) => {
    if (kept) return void thread.terminate();
    const timer = setTimeout(() => {
      forget(thread);
      void thread.terminate();
    }, idleMillis);
    timer.unref();
    kept = { thread, timer };
  };

  const take = () => {
    if (!kept) return start();
    const { thread } = kept;
    forget(thread);
    return thread;
  };

  return (url: string, timeoutMillis = extractionMillis) =>
    new Promise<NormalizedArticle>((resolve, reject) => {
      const thread = take();
      const onMessage = (reply: ExtractUrlReply) => {
        finish();
        if ("article" in reply) resolve(reply.article);
        else reject(Object.assign(new Error(reply.error), { permanent: reply.permanent }));
        keep(thread);
      };
      const onError = (error: Error) => {
        finish();
        reject(error);
      };
      const onExit = (code: number) => {
        finish();
        reject(new Error(`page extraction stopped with code ${code}`));
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error("the page took too long to read"));
        void thread.terminate();
      }, timeoutMillis);
      const finish = () => {
        clearTimeout(timer);
        thread.off("message", onMessage);
        thread.off("error", onError);
        thread.off("exit", onExit);
      };
      thread.unref();
      thread.on("message", onMessage);
      thread.on("error", onError);
      thread.on("exit", onExit);
      thread.postMessage(url);
    });
}

export const extractUrlOnThread = createUrlExtractor();
