import { parentPort } from "node:worker_threads";
import { createSearchRuntime, type SearchModelRequest } from "./search-runtime.ts";
import type { SearchDevice } from "./search-device.ts";

const requested = process.env.INKLING_SEARCH_DEVICE;
const device: SearchDevice =
  requested === "cuda" || requested === "dml" || requested === "webgpu" ? requested : "cpu";
const runtime = createSearchRuntime(device, process.env.INKLING_SEARCH_TEXT_ONLY === "1");
type Message = { id: number; directory: string; request: SearchModelRequest };
const send = (reply: object) => {
  if (parentPort) parentPort.postMessage(reply);
  else process.send?.(reply);
};
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
        send({ id: message.id, result, device });
      } catch {
        send({ id: message.id, error: "Local search inference failed", device });
      }
    }
  } finally {
    running = false;
  }
}
const receive = (message: Message) => {
  if (message.request.kind === "query") pending.unshift(message);
  else pending.push(message);
  void drain();
};
if (parentPort) parentPort.on("message", receive);
else {
  process.on("message", receive);
  process.once("disconnect", () => {
    void runtime.close().finally(() => process.exit());
  });
}
