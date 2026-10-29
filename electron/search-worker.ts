import { parentPort } from "node:worker_threads";
import { createSearchRuntime, type SearchModelRequest } from "./search-runtime.ts";

const runtime = createSearchRuntime();
type Message = { id: number; directory: string; request: SearchModelRequest };
const pending: Message[] = [];
let running = false;
async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const message = pending.shift();
      if (!message) break;
      try {
        const result = await runtime.run(message.directory, message.request);
        parentPort?.postMessage({ id: message.id, result });
      } catch (error) {
        parentPort?.postMessage({
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    running = false;
  }
}
parentPort?.on("message", (message: Message) => {
  if (message.request.kind === "query") pending.unshift(message);
  else pending.push(message);
  void drain();
});
