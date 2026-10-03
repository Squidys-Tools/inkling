// Isolated-world entry point, injected on invoke by background.ts AFTER
// content-main.js. Parks the payload promise on the isolated world's own
// globalThis, which background.ts reads back.
//
// The result is deliberately NOT mirrored into the DOM: the page shares the
// DOM, so anything published there can be read or forged by the page itself,
// which would let a hostile page make the extension save a capture of its
// choosing. The isolated world is not reachable from page script, so the
// promise below is the only channel a capture travels over.
import { extractCurrentPage } from "./defuddle-extract";
import { EXTRACT_PAYLOAD_PROMISE_KEY } from "./extract-promise-key";

const resultPromise = (async () => {
  const { payload } = await extractCurrentPage();
  return payload;
})();

(globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = resultPromise;
void resultPromise.catch(() => undefined);
