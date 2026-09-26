import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PageCapturePayloadV1 } from "@inkling/ingestion-shared";

let domResult: string | null = null;

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
      const source = options.func.toString();
      if (source.includes("node.textContent")) return [{ frameId: 0, result: domResult }];
      if (source.includes("getElementById")) return [{ frameId: 0, result: undefined }];
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
  domResult = null;
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
    // Cleanup, content-main, content-isolated, then the promise handoff.
    expect(executeScript).toHaveBeenCalledTimes(4);
    expect(executeScript.mock.calls[0]?.[0]?.world).toBe("ISOLATED");
    expect(executeScript.mock.calls[1]?.[0]?.files).toEqual(["content-main.js"]);
    expect(executeScript.mock.calls[2]?.[0]?.files).toEqual(["content-isolated.js"]);
    expect(typeof executeScript.mock.calls[3]?.[0]?.func).toBe("function");
  });

  test("falls back to the DOM handoff when the promise is not shared", async () => {
    const payload = pagePayload();
    domResult = JSON.stringify({ ok: true, payload });

    const result = await injectExtractor(42);

    expect(result).toEqual(payload);
  });

  test("propagates extraction failures instead of returning undefined", async () => {
    (globalThis as Record<string, unknown>)[EXTRACT_PAYLOAD_PROMISE_KEY] = Promise.reject(
      new Error("defuddle failed"),
    );
    domResult = JSON.stringify({ ok: false, error: "defuddle failed" });

    await expect(injectExtractor(7)).rejects.toThrow("defuddle failed");
  });
});
