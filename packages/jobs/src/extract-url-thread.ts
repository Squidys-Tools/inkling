import { parentPort, workerData } from "node:worker_threads";
import { ingestUrl } from "@inkling/ingestion";
import type { ExtractUrlReply } from "./extract-url.ts";

const { url } = workerData as { url: string };
let reply: ExtractUrlReply;
try {
  reply = { article: await ingestUrl(url) };
} catch (error) {
  reply = {
    error: error instanceof Error ? error.message : String(error),
    permanent: error instanceof Error && "permanent" in error && error.permanent === true,
  };
}
parentPort?.postMessage(reply);
