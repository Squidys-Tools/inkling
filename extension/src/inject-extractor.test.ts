import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

// Stands in for the isolated world: runs the injected func here, against this
// globalThis, the way the browser runs it in the tab's isolated world. So the
// fake extractor is installed under the same constant the real bundle uses, and
// a background that named the global anything else finds nothing.
const isolatedWorld = globalThis as Record<string, unknown>;

const executeScript = mock(
  async (options: {
    args?: unknown[];
    files?: string[];
    // Stringified into the page, so its parameters are whatever args carry.
    func?: (key: string) => unknown;
    target?: { tabId: number };
    world?: string;
  }) => {
    // File injections: the IIFE bundle's completion value is discarded —
    // injectExtractor must not rely on it.
    if (options.files) return [{ frameId: 0, result: undefined }];
    if (options.func) {
      const [key] = (options.args ?? []) as [string];
      try {
        return [{ frameId: 0, result: await options.func(key) }];
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    }
    return [{ frameId: 0 }];
  },
);

mock.module("webextension-polyfill", () => ({
  default: {
    scripting: { executeScript },
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: { addListener: () => {} },
    },
    contextMenus: { create: () => {}, onClicked: { addListener: () => {} } },
    commands: { onCommand: { addListener: () => {} } },
    tabs: {
      create: async () => ({}),
      query: async () => [],
      sendMessage: async () => {},
    },
  },
}));

const { injectExtractor } = await import("./background");
const { EXTRACTOR_FN_KEY } = await import("./extract-handoff");

function pagePayload(marker = "one"): PageCapturePayloadV1 {
  return {
    version: 1,
    kind: "page",
    url: "https://example.com/article",
    title: "Article",
    defuddledHtml: `<p>${marker}</p>`,
    text: marker,
    imageUrls: [],
  };
}

/** Install a fake extractor the way content-isolated.ts installs the real one. */
function installExtractor(extract: () => Promise<unknown>): void {
  isolatedWorld[EXTRACTOR_FN_KEY] = extract;
}

beforeEach(() => {
  executeScript.mockClear();
  delete isolatedWorld[EXTRACTOR_FN_KEY];
});

describe("injectExtractor", () => {
  test("reads the payload the isolated content script extracted", async () => {
    const payload = pagePayload();
    installExtractor(async () => payload);

    const result = await injectExtractor(42);

    expect(result).toEqual(payload);
    // content-main, content-isolated, then the invocation.
    expect(executeScript).toHaveBeenCalledTimes(3);
    expect(executeScript.mock.calls[0]?.[0]?.files).toEqual(["content-main.js"]);
    expect(executeScript.mock.calls[1]?.[0]?.files).toEqual(["content-isolated.js"]);
    expect(executeScript.mock.calls[2]?.[0]?.world).toBe("ISOLATED");
  });

  test("names the isolated global from the shared constant", async () => {
    // The func is stringified into the page, so a literal copy of the name would
    // silently break every capture the day the constant is renamed. The name
    // travels in as an argument; asserting on it is the guard.
    installExtractor(async () => pagePayload());
    await injectExtractor(42);

    expect(executeScript.mock.calls[2]?.[0]?.args).toEqual([EXTRACTOR_FN_KEY]);
  });

  test("returns both captures from two overlapping extractions", async () => {
    // Two saves on one tab in quick succession. Parking each payload in a shared
    // slot let the second overwrite the first, so one save read back the other's
    // capture and the other saw nothing at all.
    let call = 0;
    let released: () => void = () => {};
    const bothStarted = new Promise<void>((resolve) => {
      released = resolve;
    });
    installExtractor(async () => {
      const index = call;
      call += 1;
      if (call === 2) released();
      // Both extractions are in flight before either resolves.
      await bothStarted;
      return pagePayload(index === 0 ? "first" : "second");
    });

    const [first, second] = await Promise.all([injectExtractor(42), injectExtractor(42)]);

    expect((first as PageCapturePayloadV1).text).toBe("first");
    expect((second as PageCapturePayloadV1).text).toBe("second");
  });

  test("fails instead of reading a forged payload from the DOM", async () => {
    // The page shares the DOM. A result published there — under any id, with or
    // without a handshake — could be planted by the page to make the extension
    // save a capture of its choosing, so there is no DOM read at all.
    // Plant a result node exactly as a hostile page would, then assert the
    // extension still refuses it: there is no DOM read to be fooled by.
    let reads = 0;
    const plant = () => {
      reads += 1;
      return { textContent: JSON.stringify({ ok: true, payload: pagePayload() }), remove: () => {} };
    };
    (globalThis as unknown as { document: { getElementById: () => unknown } }).document = {
      getElementById: plant,
    };
    try {
      await expect(injectExtractor(7)).rejects.toThrow("extractor returned no result");
      expect(reads).toBe(0);
    } finally {
      delete (globalThis as unknown as Record<string, unknown>).document;
    }
  });

  test("propagates extraction failures instead of returning undefined", async () => {
    installExtractor(async () => {
      throw new Error("defuddle failed");
    });

    await expect(injectExtractor(7)).rejects.toThrow("defuddle failed");
  });
});

test("the isolated bundle installs the extractor under the same name", async () => {
  // The two halves of the handoff are compiled into different bundles, so the
  // name they share has to come from one place. Importing the bundle here is
  // what makes a divergent copy in either half fail.
  await import("./content-isolated");
  try {
    expect(typeof isolatedWorld[EXTRACTOR_FN_KEY]).toBe("function");
  } finally {
    delete isolatedWorld[EXTRACTOR_FN_KEY];
  }
});