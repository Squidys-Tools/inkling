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
    // this is the pre-fix behavior injectExtractor must not rely on.
    if (options.files) return [{ frameId: 0, result: undefined }];
    if (options.func) {
      const result = await options.func();
      return [{ frameId: 0, result }];
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
  test("awaits the promise the content script parks on globalThis", async () => {
    const payload = pagePayload();
    (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] =
      Promise.resolve(payload);

    const result = await injectExtractor(42);

    expect(result).toEqual(payload);
    // Consumed so a later flush cannot see a stale promise.
    expect((globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY]).toBeUndefined();
    // content-main, content-isolated, then the func await step.
    expect(executeScript).toHaveBeenCalledTimes(3);
    expect(executeScript.mock.calls[0]?.[0]?.files).toEqual(["content-main.js"]);
    expect(executeScript.mock.calls[1]?.[0]?.files).toEqual(["content-isolated.js"]);
    expect(typeof executeScript.mock.calls[2]?.[0]?.func).toBe("function");
  });

  test("propagates extraction failures instead of returning undefined", async () => {
    (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = Promise.reject(
      new Error("defuddle failed"),
    );

    await expect(injectExtractor(7)).rejects.toThrow("defuddle failed");
  });
});
