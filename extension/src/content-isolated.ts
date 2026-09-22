// Isolated-world entry point, injected on invoke by background.ts AFTER
// content-main.js. Runs the extractor and parks the payload Promise on
// globalThis — the Vite IIFE wrapper discards the async IIFE's completion
// value, so executeScript({files}) alone always sees undefined (that was the
// "page extraction produced no usable content" bug). background.ts follows
// up with a func injection that returns this Promise, which executeScript
// awaits. No messaging, no persistent listeners, nothing that outlives the
// single save invocation.
import { extractCurrentPage } from "./defuddle-extract";
import { EXTRACT_PAYLOAD_PROMISE_KEY } from "./extract-promise-key";

(globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = (async () => {
  const { payload } = await extractCurrentPage();
  return payload;
})();
