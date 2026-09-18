// Isolated-world entry point, injected on invoke by background.ts AFTER
// content-main.js. Runs the extractor and RETURNS the payload as the
// executeScript result — no messaging, no persistent listeners, nothing that
// outlives the single save invocation.
import { extractCurrentPage } from "./defuddle-extract";

(async () => {
  const { payload } = await extractCurrentPage();
  return payload;
})();
