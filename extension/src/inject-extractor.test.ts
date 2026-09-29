import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

const executeScript = mock(
  async (options: {
    files?: string[];
    func?: () => unknown;
    target?: { tabId: number };
    world?: string;
  }) => {
    // File injections: the IIFE bundle's completion value is discarded —
    // injectExtractor must not rely on it.
    if (options.files) return [{ frameId: 0, result: undefined }];
    if (options.func) {
      const source = options.func.toString();
      if (source.includes("__inklingExtractPayloadPromise")) {
        return [{ frameId: 0, result: await options.func() }];
      }
      return [{ frameId: 0, result: undefined }];
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
const { EXTRACT_PAYLOAD_PROMISE_KEY } = await import("./extract-promise-key");

function pagePayload(): PageCapturePayloadV1 {
  return {
    version: 1,
    kind: "page",
    url: "https://example.com/article",
    title: "Article",
    defuddledHtml: "<p>hi</p>",
    text: "hi",
    imageUrls: [],
  };
}

beforeEach(() => {
  executeScript.mockClear();
  delete (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY];
});

describe("injectExtractor", () => {
  test("reads the payload the isolated content script parked on globalThis", async () => {
    const payload = pagePayload();
    (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] =
      Promise.resolve(payload);

    const result = await injectExtractor(42);

    expect(result).toEqual(payload);
    // Consumed so a later flush cannot see a stale promise.
    expect(
      (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY],
    ).toBeUndefined();
    // content-main, content-isolated, then the promise handoff.
    expect(executeScript).toHaveBeenCalledTimes(3);
    expect(executeScript.mock.calls[0]?.[0]?.files).toEqual(["content-main.js"]);
    expect(executeScript.mock.calls[1]?.[0]?.files).toEqual(["content-isolated.js"]);
    expect(executeScript.mock.calls[2]?.[0]?.world).toBe("ISOLATED");
  });

  test("fails instead of reading a forged payload from the DOM", async () => {
    // The page shares the DOM. A result published there — under any id, with
    // or without a handshake — could be planted by the page to make the
    // extension save a capture of its choosing, so there is no DOM read at all.
    // Without the isolated-world promise, capture fails honestly.
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
    (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = Promise.reject(
      new Error("defuddle failed"),
    );

    await expect(injectExtractor(7)).rejects.toThrow("defuddle failed");
  });
});
