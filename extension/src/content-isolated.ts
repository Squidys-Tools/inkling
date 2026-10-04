// Isolated-world entry point, injected on invoke by background.ts AFTER
// content-main.js. Installs the extractor on the isolated world's own
// globalThis; background.ts invokes it with a func injection and awaits the
// payload it returns.
//
// The result is deliberately NOT mirrored into the DOM: the page shares the
// DOM, so anything published there can be read or forged by the page itself,
// which would let a hostile page make the extension save a capture of its
// choosing. The isolated world is not reachable from page script, so this
// global is the only channel a capture travels over.
//
// Install, do not run. The extraction belongs to the invocation that asks for
// it: publishing its result into a shared slot let a second save on the same tab
// overwrite the first one's capture before it was read back.
import { extractCurrentPage } from "./defuddle-extract";
import { EXTRACTOR_FN_KEY } from "./extract-handoff";

(globalThis as Record<string, unknown>)[EXTRACTOR_FN_KEY] = async () => {
  const { payload } = await extractCurrentPage();
  return payload;
};
