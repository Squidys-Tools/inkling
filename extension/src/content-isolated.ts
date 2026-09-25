// Isolated-world entry point, injected on invoke by background.ts AFTER
// content-main.js. Parks the payload on globalThis and mirrors the settled
// result into the DOM so Chrome's separate script-injection worlds cannot drop
// the handoff.
import { extractCurrentPage } from "./defuddle-extract";
import { EXTRACT_PAYLOAD_PROMISE_KEY, EXTRACT_RESULT_NODE_ID } from "./extract-promise-key";

type ExtractionResult =
  | { ok: true; payload: Awaited<ReturnType<typeof extractCurrentPage>>["payload"] }
  | { ok: false; error: string };

function publishResult(result: ExtractionResult): void {
  const node = document.createElement("script");
  node.id = EXTRACT_RESULT_NODE_ID;
  node.type = "application/json";
  node.textContent = JSON.stringify(result);
  (document.documentElement ?? document.body)?.append(node);
}

const resultPromise = (async () => {
  try {
    const { payload } = await extractCurrentPage();
    publishResult({ ok: true, payload });
    return payload;
  } catch (error) {
    publishResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
})();

(globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = resultPromise;
void resultPromise.catch(() => undefined);
