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

/**
 * Parsing a large page holds its thread for up to 40 s, and on the worker's own thread that stops
 * every download, thumbnail and reply. Each page gets a thread, so its memory goes when it ends.
 */
export function extractUrlOnThread(url: string, timeoutMillis = extractionMillis) {
  return new Promise<NormalizedArticle>((resolve, reject) => {
    const thread = new Worker(threadUrl, { workerData: { url } });
    const timer = setTimeout(() => {
      reject(new Error("the page took too long to read"));
      void thread.terminate();
    }, timeoutMillis);
    thread.unref();
    thread.once("message", (reply: ExtractUrlReply) => {
      clearTimeout(timer);
      if ("article" in reply) resolve(reply.article);
      else reject(Object.assign(new Error(reply.error), { permanent: reply.permanent }));
      void thread.terminate();
    });
    thread.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    thread.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`page extraction stopped with code ${code}`));
    });
  });
}
